#!/bin/bash
#
# LRCLIB Index Extraction Script Runner (Rust version)
#
# Usage:
#   ./scripts/run-extraction.sh /path/to/lrclib-dump.sqlite3 [output-path]
#
# Example:
#   ./scripts/run-extraction.sh ~/git/music/lrclib-db-dump-20251209T092057Z.sqlite3
#   ./scripts/run-extraction.sh ~/git/music/lrclib-dump.sqlite3 ~/git/music/lrclib-index.sqlite3
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUST_PROJECT="$SCRIPT_DIR/lrclib-extract"
BINARY="$RUST_PROJECT/target/release/lrclib-extract"

# Check arguments
if [ -z "$1" ]; then
    echo "Usage: $0 <path-to-lrclib-dump.sqlite3> [output-path]"
    echo ""
    echo "Example:"
    echo "  $0 ~/git/music/lrclib-db-dump-20251209T092057Z.sqlite3"
    echo "  $0 ~/git/music/lrclib-dump.sqlite3 ~/git/music/lrclib-index.sqlite3"
    exit 1
fi

SOURCE_DB="$1"
OUTPUT_DB="${2:-${SOURCE_DB%.*}-index.sqlite3}"

# Validate source exists
if [ ! -f "$SOURCE_DB" ]; then
    echo "Error: Source database not found: $SOURCE_DB"
    exit 1
fi

echo "========================================"
echo "LRCLIB Index Extraction (Rust)"
echo "========================================"
echo ""
echo "Source:  $SOURCE_DB"
echo "Output:  $OUTPUT_DB"
echo ""

# Build Rust binary if needed
if [ ! -f "$BINARY" ] || [ "$RUST_PROJECT/src/main.rs" -nt "$BINARY" ] || [ "$RUST_PROJECT/Cargo.toml" -nt "$BINARY" ]; then
    echo "Building Rust binary..."
    echo ""
    (cd "$RUST_PROJECT" && cargo build --release)
    echo ""
fi

# Run extraction
echo "Starting extraction..."
echo ""

"$BINARY" "$SOURCE_DB" "$OUTPUT_DB"

# Test search using sqlite3 directly on output
echo ""
echo "========================================"
echo "Testing search..."
echo "========================================"

for query in "everlong foo fighters" "bohemian rhapsody queen" "nothing else matters metallica"; do
    echo ""
    echo "Search: '$query'"
    echo "----------------------------------------"
    sqlite3 "$OUTPUT_DB" "
        SELECT t.id, t.artist || ' - ' || t.title || ' (' || COALESCE(t.album, 'Unknown') || ') [' || t.duration_sec || 's]'
        FROM tracks_fts fts
        JOIN tracks t ON fts.rowid = t.id
        WHERE tracks_fts MATCH '$query'
        ORDER BY -bm25(tracks_fts, 10.0, 1.0) + t.quality * 0.1 DESC
        LIMIT 5;
    "
done

echo ""
echo "========================================"
echo "Done!"
echo "========================================"
echo ""
echo "Output file: $OUTPUT_DB"
echo "Size: $(du -h "$OUTPUT_DB" | cut -f1)"
echo ""
echo "Next steps:"
echo "  1. Upload to Turso:"
echo "     turso db shell scrolltunes-lrclib < $OUTPUT_DB"
echo "  2. Or recreate from file:"
echo "     turso db destroy scrolltunes-lrclib"
echo "     turso db create scrolltunes-lrclib --from-file $OUTPUT_DB"
