#!/bin/bash

# Ralph Wiggum Loop
# Reference: https://github.com/ghuntley/how-to-ralph-wiggum
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

for arg in "$@"; do
  if [[ "$arg" == "plan" ]]; then
    MODE="plan"
  elif [[ "$arg" =~ ^[0-9]+$ ]]; then
    MAX_ITERATIONS=$arg
  fi
done

PROMPT_FILE="PROMPT_${MODE}.md"

echo "Ralph loop: $(echo "$MODE" | tr '[:lower:]' '[:upper:]') mode"
[[ $MAX_ITERATIONS -gt 0 ]] && echo "Max iterations: $MAX_ITERATIONS"
echo "Press Ctrl+C to stop"
echo "---"

while true; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "=== Iteration $ITERATION ==="
  echo ""

  claude -p \
    --dangerously-skip-permissions \
    --model opus \
    --output-format stream-json \
    <<< "$(cat "$PROMPT_FILE")" \
    | jq -r 'select(.type == "assistant") | .message.content[]?.text // empty'

  if [[ $MAX_ITERATIONS -gt 0 && $ITERATION -ge $MAX_ITERATIONS ]]; then
    echo ""
    echo "Reached max iterations ($MAX_ITERATIONS)."
    break
  fi

  sleep 2
done

echo ""
echo "Ralph loop complete. Iterations: $ITERATION"
