# Engineering Proposal: Search Fallback Matching For Non-Latin Lyrics Queries

Date: 2026-10-11  
Owner: ahmad fikril  
Status: WIP draft — kept in `docs/engineering/_WIP/`, not yet promoted into the stable docs tree  
Risk class: medium  
Related issue: [fikrilal/gnome-lyricbar#8](https://github.com/fikrilal/gnome-lyricbar/issues/8)

## Summary

Issue #8 reports tracks that never display lyrics even though matching entries exist on LRCLIB. The reproducible root cause is in the synced-search fallback scorer: `normalizeComparable()` in `src/domain/lyrics/provider-result.js` reduces artist and title to `[a-z0-9]` characters, so any artist or title written in a non-Latin script normalizes to an empty string and every candidate is rejected by `scoreSearchResult()`.

The proposal is a single-contract fix: preserve Unicode letters, numbers, and combining marks during scorer normalization (`[^\p{L}\p{N}\p{M}]+`), leaving match gates, score weights, duration tolerance, lookup endpoints, and cache format unchanged. A simulation using the production modules against live LRCLIB data for the issue-#8 scenario moves the outcome from "20 synced candidates, all rejected" to selecting a valid synced candidate.

The reporter's concrete example track (李荣浩 — 鸿门宴) is not present on LRCLIB at all and cannot be fixed by this change; that distinction must be communicated when the issue is answered.

## Context

### Current fallback path

Lyric lookup has two tiers (`src/runtime/lyrics/lrclib.js`):

1. `GET /api/get` — exact match on artist and title, disambiguated by album and duration (duration tolerance observed around ±2 s).
2. `GET /api/search` — on a miss, a parameter search (`artist_name` + `track_name`) whose results are filtered by `parseBestSyncedLrclibSearchResponse()` in the domain layer.

The scorer is deliberately conservative. It requires the candidate artist and title to match (equality or substring after normalization) and rejects candidates whose duration differs by more than 3 s. When nothing is accepted, the lookup resolves to `not-found`, and the indicator falls back to the track title (with the default `track` fallback mode) — the exact symptom in issue #8.

### Evidence

- Reproduction using production modules against the live API: query `周杰伦 / 晴天 / 晴天 - Single / 270000 ms` → `/api/get` returns 404 → `/api/search` returns 20 synced candidates → the scorer rejects all of them → `not-found`. With album `叶惠美`, the exact path answers 200 and lyrics display. This explains why "some songs work": those tracks hit the exact path, which does not use the scorer.
- The defect is client-side only: LRCLIB's parameter search returns CJK results correctly (verified for multiple artists, including tracks with synced lyrics).
- Reporter's example track: no `李荣浩 — 鸿门宴` entry exists on LRCLIB under any probed query form (simplified and traditional, parameter and `q=` search). This example stays broken after the fix.
- The report's non-CJK claim was not reproduced. The 3 s duration gate is the likely separate failure class and is out of scope here.
- The proposed normalization was executed inside GJS (the GNOME 46–50 runtime) and in a scoring simulation: scripts are preserved, Latin diacritic folding is unchanged, and the issue-#8 scenario selects a valid synced candidate.

## Goals

- Tracks whose artist/title use non-Latin scripts pass the fallback scorer whenever a candidate is genuinely the same recording — CJK, Cyrillic, Hangul, kana, and mixed-script metadata.
- No loosening of any gate or weight beyond script preservation: the fix must not admit new false-positive classes.
- The change stays in the pure domain layer and remains unit-testable without GNOME Shell.

## Non-Goals

- Transliteration or romanized matching (CJK ↔ Latin).
- Changing the 3 s duration gate, score weights, or adding new search tiers (e.g. free-text `q=`).
- Endpoint, timeout, retry, privacy, or cache-schema changes.
- Fixing tracks that are absent from LRCLIB.

## Constraints And Invariants

- Domain purity: `src/domain/**` must not import GJS, Shell, network, or filesystem APIs (`scripts/check-architecture.mjs`).
- Candidate rejection on empty normalized artist/title stays; only the definition of "empty" changes.
- Latin diacritic folding is preserved (`Motörhead` ≡ `Motorhead`).
- Kana voicing distinction is preserved (`ガガ` ≠ `カカ`); Hangul decomposition under NFKD stays symmetric, so equality is unaffected.
- Selection remains deterministic and independent of result ordering.
- Unicode property escapes are supported by the GJS engine shipped with GNOME Shell 46–50 (verified on the local runtime).

## Proposed Design

### Normalization contract

`normalizeComparable()` keeps its pipeline (NFKD → lowercase → strip `U+0300–U+036F` → `&` becomes `and` → collapse punctuation and whitespace) with one change: the final scrub becomes `[^\p{L}\p{N}\p{M}]+` instead of `[^a-z0-9]+`.

| Input       | Current output | Proposed output    | Note                                   |
| ----------- | -------------- | ------------------ | -------------------------------------- |
| `李荣浩`    | `""`           | `李荣浩`           | CJK preserved                          |
| `Кино`      | `""`           | `кино`             | Cyrillic preserved                     |
| `Motörhead` | `motorhead`    | `motorhead`        | Latin folding unchanged                |
| `ガガ`      | `""`           | `カ` with `U+3099` | Kana voicing kept; differs from `カカ` |
| `서울`      | `""`           | decomposed jamo    | Symmetric on both sides                |

The `\p{M}` allowance is what keeps kana voiced marks attached to their base syllable; scrubbing them instead (bare `\p{L}\p{N}`) would collapse `ガ` into `カ` and admit wrong matches inside Japanese titles.

### Where the change lands

```text
track change
  → /api/get — 200 synced | instrumental ─────────────────→ display lyrics
      │ 404 | plain only
      ↓
  → /api/search — artist_name + track_name
      │  scorer gates: artist match · title match · |Δduration| ≤ 3 s
      │  (normalization fix applies inside the gates)          ← change
      ↓
      best-scoring synced candidate ────────────────────────→ display lyrics
      none accepted ────────────────────────────────────────→ not-found → fallback
```

### Unchanged behavior

- `scoreSearchResult()` gates, weights, and tie behavior; `scoreDuration()` gate; `stripParentheticalSuffix()`; URL building; exact-path parsing.
- The scorer remains private to `provider-result.js`; no callers change.

### Cache And Rollout

- Fixed matching applies to lookups performed from the running version onward.
- Stale negative entries (`not-found`, 6 h TTL) self-heal within one TTL; positive entries (30 d) are unaffected and stay valid.
- No cache-schema bump: invalidating the positive cache to accelerate recovery is not worth re-downloading 30 days of good entries.

## Risks And Tradeoffs

- **Substring over-matching for short non-Latin titles.** `includes()` semantics now operate on e.g. two-character CJK titles. Mitigations: exact-match bonuses already outrank substring matches, the duration gate still applies, and tests should include adversarial near-miss pairs. Keep `includes()` semantics identical to Latin behavior rather than inventing script-specific rules.
- **Script normalization subtleties.** Hangul and kana decompose under NFKD; the contract above was verified in GJS and must become unit tests so future refactors cannot silently break it.
- **Expectation management on issue #8.** The fix resolves the reproducible failure class, not the reporter's specific example (absent from LRCLIB). The issue response must separate the two.

## Acceptance Criteria

1. Unit tests encode the normalization contract per script (CJK, Cyrillic, Hangul, kana) and the invariants above.
2. A regression test built from a captured `/api/search` fixture reproduces the issue-#8 scenario (album-decoration mismatch, CJK) and expects a synced selection instead of `not-found`.
3. Existing selection, duration-gate, and artist-mismatch tests pass unchanged.
4. `npm run verify` passes.
5. Runtime evidence: with a CJK track that requires the fallback path, the panel renders a synced lyric line (per the runtime harness workflow in `docs/harness/`).

## Open Questions

1. **Documentation destination after stabilization.** Fold this into `docs/engineering/proposal.md`, or promote a focused engineering doc (matching `docs/README.md`'s rule that topics move out of the proposal once stable)?
2. **Separate issue for the duration gate.** File a tracking issue for the non-CJK failure class rather than widening scope here?
3. **Issue #8 response.** Comment with the reproduction and the example-track caveat now, or after a fix PR exists?
