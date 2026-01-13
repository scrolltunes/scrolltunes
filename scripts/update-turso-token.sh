#!/bin/bash
# Upload LRCLIB index to Turso and update tokens

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.local"
DB_NAME="scrolltunes-lrclib"

# Check command line argument
if [ -z "$1" ]; then
  echo "Usage: $0 <path-to-sqlite-db>"
  echo "Example: $0 /Users/hmemcpy/git/music/lrclib-spotify-db.sqlite3"
  exit 1
fi

DB_FILE="$1"

echo "=== Turso LRCLIB Upload Script ==="
echo ""

# Check if database file exists
if [ ! -f "$DB_FILE" ]; then
  echo "Error: Database file not found: $DB_FILE"
  exit 1
fi

echo "Database file: $DB_FILE"

# Prepare the SQLite file (WAL mode)
echo "Preparing database file..."
sqlite3 "$DB_FILE" "PRAGMA journal_mode=WAL; PRAGMA wal_checkpoint(TRUNCATE);" || true

# Delete existing database
echo "Deleting existing Turso database..."
turso db destroy "$DB_NAME" --yes 2>/dev/null || echo "Database didn't exist, continuing..."

# Copy to temp file with valid name
TEMP_DB="/tmp/${DB_NAME}.sqlite3"
cp "$DB_FILE" "$TEMP_DB"

# Import to Turso
echo "Uploading to Turso (this may take a few minutes)..."
turso db import "$TEMP_DB" --group default

# Clean up temp file
rm -f "$TEMP_DB"

# Get new token
echo "Fetching new token..."
sleep 2
NEW_TOKEN=$(turso db tokens create "$DB_NAME" 2>/dev/null)

if [ -z "$NEW_TOKEN" ]; then
  echo "Error: Failed to get token from Turso"
  exit 1
fi

echo "Got new token: ${NEW_TOKEN:0:20}..."

# Update .env.local
if [ -f "$ENV_FILE" ]; then
  if grep -q "^TURSO_AUTH_TOKEN=" "$ENV_FILE"; then
    sed -i '' "s|^TURSO_AUTH_TOKEN=.*|TURSO_AUTH_TOKEN=$NEW_TOKEN|" "$ENV_FILE"
    echo "Updated TURSO_AUTH_TOKEN in .env.local"
  else
    echo "TURSO_AUTH_TOKEN=$NEW_TOKEN" >> "$ENV_FILE"
    echo "Added TURSO_AUTH_TOKEN to .env.local"
  fi
else
  echo "Error: $ENV_FILE not found"
  exit 1
fi

# Update Vercel (production)
echo "Updating Vercel production environment..."
vercel env rm TURSO_AUTH_TOKEN production -y 2>/dev/null || true
printf '%s' "$NEW_TOKEN" | vercel env add TURSO_AUTH_TOKEN production

echo ""
echo "=== Done! ==="
echo "  - Database uploaded to Turso"
echo "  - Token updated in .env.local"
echo "  - Token updated in Vercel (production)"
echo ""
echo "To deploy: vercel --prod"
