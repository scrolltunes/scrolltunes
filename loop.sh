#!/bin/bash

# Ralph Wiggum Loop (Enhanced)
# Reference: https://github.com/ghuntley/how-to-ralph-wiggum
#
# Features:
#   - Automatic usage limit detection and recovery
#   - Sleep until reset with countdown
#   - Graceful retry after rate limits
#
# Usage:
#   ./loop.sh           # Build mode (default)
#   ./loop.sh plan      # Planning mode
#   ./loop.sh 10        # Max 10 iterations
#   ./loop.sh plan 5    # Planning mode, max 5 iterations

set -e

MODE="build"
MAX_ITERATIONS=0
ITERATION=0
CONSECUTIVE_FAILURES=0
MAX_CONSECUTIVE_FAILURES=3

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

for arg in "$@"; do
  if [[ "$arg" == "plan" ]]; then
    MODE="plan"
  elif [[ "$arg" =~ ^[0-9]+$ ]]; then
    MAX_ITERATIONS=$arg
  fi
done

PROMPT_FILE="PROMPT_${MODE}.md"

# Calculate seconds until next hour boundary
seconds_until_next_hour() {
  local now=$(date +%s)
  local current_minute=$(date +%M)
  local current_second=$(date +%S)
  local seconds_past_hour=$((10#$current_minute * 60 + 10#$current_second))
  local seconds_until=$((3600 - seconds_past_hour))
  echo $seconds_until
}

# Calculate seconds until specific reset time (e.g., midnight UTC, 5am local)
seconds_until_daily_reset() {
  # Assuming daily reset at 5:00 AM local time (adjust as needed)
  local reset_hour=5
  local now=$(date +%s)
  local today_reset=$(date -v${reset_hour}H -v0M -v0S +%s 2>/dev/null || date -d "today ${reset_hour}:00:00" +%s)

  if [[ $now -ge $today_reset ]]; then
    # Reset already passed today, calculate for tomorrow
    local tomorrow_reset=$((today_reset + 86400))
    echo $((tomorrow_reset - now))
  else
    echo $((today_reset - now))
  fi
}

# Display countdown timer
countdown() {
  local seconds=$1
  local message=$2

  while [[ $seconds -gt 0 ]]; do
    local hours=$((seconds / 3600))
    local minutes=$(((seconds % 3600) / 60))
    local secs=$((seconds % 60))
    printf "\r${CYAN}%s${NC} Time remaining: %02d:%02d:%02d " "$message" $hours $minutes $secs
    sleep 1
    ((seconds--))
  done
  printf "\r%-80s\r" " "  # Clear the line
}

# Check if error indicates usage limit exceeded
is_usage_limit_error() {
  local output="$1"
  local exit_code="$2"

  # Check for common rate limit / usage limit patterns
  if [[ "$output" =~ (rate.?limit|usage.?limit|quota.?exceeded|too.?many.?requests|429|exceeded.*limit|limit.*exceeded|billing|credit) ]]; then
    return 0
  fi

  # Exit code 1 with specific error patterns
  if [[ "$exit_code" == "1" && "$output" =~ (overloaded|capacity|unavailable) ]]; then
    return 0
  fi

  return 1
}

# Determine sleep duration based on error type
get_sleep_duration() {
  local output="$1"

  # Try to extract reset time from error message if present
  # Pattern: "resets at HH:MM" or "try again in X minutes/hours"
  if [[ "$output" =~ "try again in "([0-9]+)" minute" ]]; then
    echo $(( ${BASH_REMATCH[1]} * 60 + 60 ))  # Add 1 minute buffer
    return
  fi

  if [[ "$output" =~ "try again in "([0-9]+)" hour" ]]; then
    echo $(( ${BASH_REMATCH[1]} * 3600 + 60 ))
    return
  fi

  # Check for daily limit vs hourly limit
  if [[ "$output" =~ (daily|day|24.?hour) ]]; then
    seconds_until_daily_reset
    return
  fi

  # Default: wait until next hour boundary + 1 minute buffer
  local wait_time=$(seconds_until_next_hour)
  echo $((wait_time + 60))
}

# Handle usage limit - sleep and retry
handle_usage_limit() {
  local output="$1"
  local sleep_duration=$(get_sleep_duration "$output")

  echo ""
  echo -e "${YELLOW}=== Usage Limit Detected ===${NC}"
  echo -e "${YELLOW}Claude usage limit exceeded. Waiting for reset...${NC}"
  echo ""

  # Show when we expect to resume
  local resume_time=$(date -v+${sleep_duration}S "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -d "+${sleep_duration} seconds" "+%Y-%m-%d %H:%M:%S")
  echo -e "Expected resume: ${CYAN}${resume_time}${NC}"
  echo ""

  countdown $sleep_duration "Waiting for usage reset..."

  echo ""
  echo -e "${GREEN}Usage limit should be reset. Resuming...${NC}"
  echo ""

  # Reset consecutive failures after successful wait
  CONSECUTIVE_FAILURES=0
}

echo -e "${GREEN}Ralph loop: $(echo "$MODE" | tr '[:lower:]' '[:upper:]') mode${NC}"
[[ $MAX_ITERATIONS -gt 0 ]] && echo "Max iterations: $MAX_ITERATIONS"
echo "Press Ctrl+C to stop"
echo "---"

while true; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo -e "${GREEN}=== Iteration $ITERATION ===${NC}"
  echo ""

  # Capture both stdout and stderr, and exit code
  TEMP_OUTPUT=$(mktemp)
  set +e

  claude -p \
    --dangerously-skip-permissions \
    --model opus \
    --output-format stream-json \
    <<< "$(cat "$PROMPT_FILE")" 2>&1 | tee "$TEMP_OUTPUT" | jq -r 'select(.type == "assistant") | .message.content[]?.text // empty' 2>/dev/null

  EXIT_CODE=$?
  OUTPUT=$(cat "$TEMP_OUTPUT")
  rm -f "$TEMP_OUTPUT"
  set -e

  # Check for usage limit errors
  if is_usage_limit_error "$OUTPUT" "$EXIT_CODE"; then
    handle_usage_limit "$OUTPUT"
    # Don't count this as an iteration - retry the same iteration
    ITERATION=$((ITERATION - 1))
    continue
  fi

  # Check for other errors
  if [[ $EXIT_CODE -ne 0 ]]; then
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    echo ""
    echo -e "${RED}=== Error (exit code: $EXIT_CODE) ===${NC}"

    if [[ $CONSECUTIVE_FAILURES -ge $MAX_CONSECUTIVE_FAILURES ]]; then
      echo -e "${RED}Too many consecutive failures ($CONSECUTIVE_FAILURES). Stopping.${NC}"
      exit 1
    fi

    echo -e "${YELLOW}Retrying in 30 seconds... (failure $CONSECUTIVE_FAILURES/$MAX_CONSECUTIVE_FAILURES)${NC}"
    sleep 30
    ITERATION=$((ITERATION - 1))  # Retry same iteration
    continue
  fi

  # Success - reset failure counter
  CONSECUTIVE_FAILURES=0

  if [[ $MAX_ITERATIONS -gt 0 && $ITERATION -ge $MAX_ITERATIONS ]]; then
    echo ""
    echo -e "${GREEN}Reached max iterations ($MAX_ITERATIONS).${NC}"
    break
  fi

  sleep 2
done

echo ""
echo -e "${GREEN}Ralph loop complete. Iterations: $ITERATION${NC}"
