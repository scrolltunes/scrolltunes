//! Safety utilities to prevent accidental file deletion.
//!
//! These checks help prevent catastrophic data loss by validating that
//! output files are not source databases before deletion.

use anyhow::{bail, Result};
use std::path::Path;

/// Validates that an output path is safe to overwrite.
///
/// Checks:
/// - Output filename must contain the required pattern (e.g., "enriched", "normalized")
/// - Output cannot be the same as any of the provided source paths
///
/// # Arguments
/// * `output` - The output path that will be created/overwritten
/// * `required_pattern` - Pattern that must appear in the output filename (e.g., "enriched")
/// * `source_paths` - Slice of source paths that must not match the output
///
/// # Returns
/// * `Ok(())` if the output path is safe
/// * `Err` with a descriptive message if the check fails
pub fn validate_output_path(
    output: &Path,
    required_pattern: &str,
    source_paths: &[&Path],
) -> Result<()> {
    let output_name = output.file_name().and_then(|n| n.to_str()).unwrap_or("");

    // Check that output contains the required pattern
    if !output_name.contains(required_pattern) {
        bail!(
            "Safety check failed: output file '{}' must contain '{}' in the name",
            output.display(),
            required_pattern
        );
    }

    // Check that output is not the same as any source
    for source in source_paths {
        if output == *source {
            bail!(
                "Safety check failed: output '{}' cannot be the same as source '{}'",
                output.display(),
                source.display()
            );
        }
    }

    // Additional check: output should not match common source patterns
    let dangerous_patterns = ["spotify_clean.sqlite3", "lrclib-db-dump", "audio_features"];
    for pattern in dangerous_patterns {
        if output_name.contains(pattern) && !output_name.contains(required_pattern) {
            bail!(
                "Safety check failed: output '{}' matches source database pattern '{}'",
                output.display(),
                pattern
            );
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_valid_output_enriched() {
        let output = PathBuf::from("/tmp/lrclib-enriched.sqlite3");
        let source = PathBuf::from("/data/lrclib-dump.sqlite3");
        assert!(validate_output_path(&output, "enriched", &[&source]).is_ok());
    }

    #[test]
    fn test_valid_output_normalized() {
        let output = PathBuf::from("/tmp/spotify_normalized.sqlite3");
        let source = PathBuf::from("/data/spotify_clean.sqlite3");
        assert!(validate_output_path(&output, "normalized", &[&source]).is_ok());
    }

    #[test]
    fn test_missing_pattern() {
        let output = PathBuf::from("/tmp/output.sqlite3");
        let source = PathBuf::from("/data/source.sqlite3");
        let result = validate_output_path(&output, "enriched", &[&source]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("must contain 'enriched'"));
    }

    #[test]
    fn test_output_equals_source() {
        let path = PathBuf::from("/data/lrclib-enriched.sqlite3");
        let result = validate_output_path(&path, "enriched", &[&path]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("cannot be the same as source"));
    }

    #[test]
    fn test_dangerous_pattern_blocked() {
        let output = PathBuf::from("/tmp/spotify_clean.sqlite3");
        let source = PathBuf::from("/data/other.sqlite3");
        let result = validate_output_path(&output, "normalized", &[&source]);
        assert!(result.is_err());
    }
}
