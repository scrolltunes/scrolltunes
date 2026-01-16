//! Progress bar and logging utilities.
//!
//! Provides helpers for creating progress bars and spinners, with support
//! for log-only mode where progress bars are hidden for tail-friendly output.

use indicatif::{ProgressBar, ProgressDrawTarget, ProgressStyle};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// Global flag for log-only mode (set from args in main)
pub static LOG_ONLY: AtomicBool = AtomicBool::new(false);

/// Set log-only mode globally
pub fn set_log_only(value: bool) {
    LOG_ONLY.store(value, Ordering::Relaxed);
}

/// Check if log-only mode is enabled
pub fn is_log_only() -> bool {
    LOG_ONLY.load(Ordering::Relaxed)
}

/// Format duration in human-readable format
pub fn format_duration(d: Duration) -> String {
    let secs = d.as_secs_f64();
    if secs < 60.0 {
        format!("{:.1}s", secs)
    } else {
        let mins = secs / 60.0;
        format!("{:.1}m", mins)
    }
}

/// Create a progress bar with consistent styling.
/// In log-only mode, the progress bar is hidden.
pub fn create_progress_bar(len: u64, msg: &str) -> ProgressBar {
    let pb = ProgressBar::new(len);
    if is_log_only() {
        pb.set_draw_target(ProgressDrawTarget::hidden());
    } else {
        pb.set_style(
            ProgressStyle::default_bar()
                .template("{msg} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({per_sec}, ETA: {eta})")
                .unwrap()
                .progress_chars("=> "),
        );
    }
    pb.set_message(msg.to_string());
    pb
}

/// Log progress periodically for tail-friendly output.
/// Only logs when in log-only mode and at specified intervals.
pub fn log_progress(phase: &str, current: u64, total: u64, interval: u64) {
    if is_log_only() && (current % interval == 0 || current == total) {
        let pct = 100.0 * current as f64 / total as f64;
        eprintln!("[{}] {}/{} ({:.1}%)", phase, current, total, pct);
    }
}

/// Create a spinner for indeterminate progress.
/// In log-only mode, the spinner is hidden.
pub fn create_spinner(msg: &str) -> ProgressBar {
    let pb = ProgressBar::new_spinner();
    if is_log_only() {
        pb.set_draw_target(ProgressDrawTarget::hidden());
    } else {
        pb.set_style(
            ProgressStyle::default_spinner()
                .template("{msg} {spinner} [{elapsed_precise}]")
                .unwrap(),
        );
        pb.enable_steady_tick(Duration::from_millis(100));
    }
    pb.set_message(msg.to_string());
    pb
}
