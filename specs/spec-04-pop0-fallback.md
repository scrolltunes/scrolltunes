# Spec 04: Pop=0 Fallback Fix

> Apply pop=0 fallback to groups that remain unmatched after scoring, not just "unseen"

## Problem Statement

Current pop=0 fallback only runs for groups that never had any candidates:

```rust
// Current logic (simplified)
for group in groups {
    if let Some(candidates) = find_candidates(&group) {
        groups_seen.insert(group.key());
        if let Some(best) = score_and_select(candidates) {
            matches.push(best);
        }
        // Group had candidates but all rejected - NOT eligible for pop=0!
    }
}

// Pop=0 phase
for group in groups {
    if !groups_seen.contains(&group.key()) {
        // Only groups that never had candidates get pop=0 treatment
        search_pop0(&group);
    }
}
```

**Problem:** If a group had candidates but all were rejected (duration mismatch, low score), it never gets the pop=0 fallback that might find a better match.

## Requirements

### R4.1: Track Match Status, Not Just "Seen"

Replace `groups_seen: HashSet` with `group_matches: HashMap`:

```rust
enum MatchStatus {
    Matched(Match),      // Found valid match
    Rejected,            // Had candidates, all rejected
    NoCandidates,        // No candidates found
}

let mut group_matches: HashMap<GroupKey, MatchStatus> = HashMap::new();
```

### R4.2: Pop=0 Eligibility Based on Match Status

Run pop=0 fallback for both `Rejected` and `NoCandidates`:

```rust
// Pop=0 phase
let unmatched_groups: Vec<_> = groups.iter()
    .filter(|g| matches!(
        group_matches.get(&g.key()),
        None | Some(MatchStatus::Rejected) | Some(MatchStatus::NoCandidates)
    ))
    .collect();

for group in unmatched_groups {
    search_pop0(&group);
}
```

### R4.3: Maintain "Rejected" vs "NoCandidates" Distinction

For failure logging, track why groups are unmatched:

```rust
struct MatchFailure {
    group: GroupKey,
    reason: FailureReason,
    // If rejected, include the candidates that were considered
    rejected_candidates: Option<Vec<RejectedCandidate>>,
}

enum FailureReason {
    NoCandidates,           // No Spotify tracks matched (title, artist)
    AllRejectedDuration,    // Candidates found but duration mismatch
    AllRejectedScore,       // Candidates found but below score threshold
    Pop0NoCandidates,       // Also no matches in pop=0 fallback
}
```

### R4.4: Pop=0 Should Override Previous Rejection

If pop=0 finds a valid match for a previously-rejected group:

```rust
if let Some(pop0_match) = search_pop0(&group) {
    // Override previous rejection
    group_matches.insert(group.key(), MatchStatus::Matched(pop0_match));
}
```

## Implementation Notes

### Current Code Location

In `main.rs`, the pop=0 fallback is implemented around line 800+:

```rust
// Current: groups_seen tracks which groups had any candidates
let groups_seen: HashSet<(String, String)> = ...;

// Fix: track match status instead
let mut match_results: HashMap<(String, String), Option<Match>> = HashMap::new();
```

### Minimal Change Approach

```rust
// Before pop=0 phase, build unmatched set
let unmatched_keys: HashSet<_> = groups.iter()
    .filter(|g| {
        match match_results.get(&g.key()) {
            Some(Some(_)) => false,  // Already matched
            _ => true,               // No match yet (rejected or no candidates)
        }
    })
    .map(|g| g.key())
    .collect();

// Pop=0 phase uses unmatched_keys instead of !groups_seen
```

### Logging Enhancement

Track why pop=0 was triggered:

```rust
enum Pop0Trigger {
    NeverSeen,      // Group had no candidates in main phase
    PreviouslyRejected {
        candidate_count: usize,
        best_rejected_score: i32,
    },
}

// Log for analysis
log::info!("[POP0] Searching for {} groups ({} never seen, {} previously rejected)",
    unmatched_keys.len(),
    never_seen_count,
    previously_rejected_count
);
```

## Acceptance Criteria

- [ ] Pop=0 fallback runs for groups where all candidates were rejected
- [ ] Match status tracks Matched/Rejected/NoCandidates distinction
- [ ] Logging shows how many groups are "previously rejected" vs "never seen"
- [ ] Pop=0 matches can override previous rejections
- [ ] Match rate improves (target: +0.5-1%)

## Dependencies

- None (independent fix)

## Estimated Impact

- **+0.5-1% match rate** from recovering previously-rejected groups
- Better insight into failure modes via enhanced logging
- Low implementation effort (mostly logic change, no schema changes)
