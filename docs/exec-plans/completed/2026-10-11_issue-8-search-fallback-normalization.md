# Plan: Lyrics Search Fallback Normalization For Non-Latin Scripts

Date: 2026-10-11  
Owner: ahmad fikril  
Status: completed  
Risk class: medium  
Related issue/PR: [fikrilal/gnome-lyricbar#8](https://github.com/fikrilal/gnome-lyricbar/issues/8)  
Proposal: `docs/engineering/_WIP/2026-10-11_issue-8-search-fallback-normalization.md`

## Objective

Make the synced-search fallback scorer accept candidates whose artist/title use non-Latin scripts, so tracks like the issue-#8 scenario display synced lyrics instead of falling back to the track title. Matching gates, score weights, the 3 s duration rule, lookup endpoints, and cache format stay unchanged.

## Constraints

- Architectural constraints:
  - Change stays inside `src/domain/lyrics/provider-result.js` (pure domain; no GJS/network imports).
  - No new dependencies; Unicode property escapes only (verified in the GJS runtime).
  - Selection stays deterministic and independent of result ordering.
- Product/runtime constraints:
  - Latin diacritic folding preserved (`Motörhead` ≡ `Motorhead`).
  - Kana voicing preserved (`ガガ` ≠ `カカ`); Hangul NFKD decomposition stays symmetric.
  - No cache schema bump; negative entries self-heal within the 6 h TTL.
- Out of scope:
  - Duration gate, score weights, new search tiers (tracked as follow-up).
  - Fixing tracks absent from LRCLIB (e.g. the issue's 李荣浩 — 鸿门宴 example).
  - GitHub issue comment / PR (requires owner approval).

## Acceptance Criteria

1. Unit tests encode the normalization contract per script (CJK, Cyrillic, Hangul, kana, Latin) and the invariants.
2. Regression test from a captured `/api/search` fixture reproduces the issue-#8 scenario and selects a synced candidate.
3. Existing selection, duration-gate, and artist-mismatch tests pass unchanged.
4. `npm run verify` passes.
5. Runtime evidence attempt per `docs/harness/runtime-agent-workflow.md`, or a recorded deferral if the nested harness is unavailable in this environment.

## Implementation Checklist

- [x] Implement Unicode-preserving scrub in `normalizeComparable()`.
- [x] Add contract unit tests and the captured-fixture regression test.
- [x] Run `npm run verify`.
- [x] Attempt nested runtime evidence; record outcome.
- [x] Update this plan with verification evidence and completion notes.

## Decision Log

- 2026-10-11: Scrub becomes `[^\p{L}\p{N}\p{M}]+` (combining marks retained) -> bare `\p{L}\p{N}` would collapse kana voicing (`ガ` → `カ`) and admit wrong Japanese matches.
- 2026-10-11: Duration gate untouched -> the non-CJK failure class is unreproduced and existing tests deliberately encode an 18 s rejection.
- 2026-10-11: Runtime evidence executed at the GJS provider level (real `LrclibProvider` with Soup HTTP against live LRCLIB) instead of a nested Shell capture -> the change has no Shell UI delta, the mock MPRIS harness is not implemented yet, and `xwd` is unavailable on this machine. Visual protocol deferred to the owner.

## Verification

List exact commands and outcomes.

```bash
npm run verify
```

Result:

```text
2026-10-11 13:58 — npm run verify passed (exit 0). Stage log:
- verify:docs, validate:metadata, validate:schema, check:architecture ok
- format:check, lint, typecheck ok
- vitest: 36 test files, 393 tests passed (27 cover the two touched lyric suites)
- build:extension: dist/lyricbar@fikrilal.github.io.zip
- validate:bundle: Bundle metadata matches repo metadata (version-name: 0.1.12)

Bundle provenance: the zip contains src/domain/lyrics/provider-result.js with the
`[^\p{L}\p{N}\p{M}]+` scrub (verified via unzip inspection).
```

## Runtime Evidence

Required when the change is medium/high-risk and behavior cannot be proven sufficiently by static checks alone.

Attempt status: Completed at the GJS provider level; nested Shell visual capture deferred (see Notes).

- GNOME Shell version: n/a for the executed level (GJS runtime on the host used directly).
- Session type: Wayland primary session; no primary-session state was touched.
- Player: n/a (lookup-level evidence); the mock MPRIS player from `docs/harness/nested-runtime-harness.md` does not exist yet.
- Scenario(s), executed with the real `LrclibProvider` (real Soup HTTP) under GJS against live LRCLIB:
  - CJK track with decorated album (issue #8 shape): `/api/get` 404 -> search fallback -> `synced | 晴天 / 周杰伦 / 270000ms | 42 lines | first="故事的小黃花"`.
  - Control with matching album: `/api/get` 200 synced (exact path unchanged).
  - Absent track (李荣浩 — 鸿门宴): 404 -> search fallback finds no acceptable candidate -> `not-found` (caveat confirmed at runtime).
- Artifact path(s): evidence scripts were session-scoped scratch files; results are recorded here. The durable regression fixture is `tests/fixtures/lyrics/cjk-search-fallback.json`.
- Notes:
  - Nested Shell visual run deferred: this change has no Shell UI delta (domain scoring only), the required mock MPRIS player is not implemented, and `xwd` is unavailable on this machine. Owner protocol: play a CJK track whose album carries a `- Single` style decoration; expected result is a synced lyric line instead of the title fallback.
  - Observed pre-existing defect (not introduced by this change): completed HTTP requests leave stale source cleanups, so `LifecycleRegistry` disposal logs `GLib-CRITICAL: Source ID ... was not found` on disable (one per completed request). Recorded in `docs/exec-plans/tech-debt-tracker.md`.

## Risks And Mitigations

- Risk: substring over-matching for short non-Latin titles.
  - Mitigation: exact-match bonuses already outrank substring matches; duration gate still applies; adversarial near-miss tests added.
- Risk: script normalization regressions during future refactors.
  - Mitigation: the contract is pinned by unit tests, which serve as the durable guardrail.
- Risk: nested runtime harness unavailable in this environment.
  - Mitigation: record a deferral with the exact protocol for the owner instead of claiming unverified runtime success.

## Completion Notes

Implemented the Unicode-preserving scrub in `normalizeComparable()` (`src/domain/lyrics/provider-result.js`). Added seven contract tests covering CJK, Cyrillic, Hangul, kana voicing, the duration gate, empty-normalization rejection, and Latin diacritic folding in `tests/lyrics/provider-result.test.js`; added the captured-fixture regression suite `tests/lyrics/cjk-search-fallback-fixtures.test.js` with `tests/fixtures/lyrics/cjk-search-fallback.json`. Runtime evidence from the real provider under GJS against live LRCLIB confirms the issue-#8 fallback path now selects the correct synced candidate. `npm run verify` passes (36 files, 393 tests) and the rebuilt bundle contains the fix.

Merged via PR #9, together with the dependency/CI refresh in PR #11. Released as v0.1.13 on 2026-10-11: the release workflow validated the tag, metadata version, and curated notes, and published `lyricbar@fikrilal.github.io.zip`.

## Follow-Ups

- [x] File the duration-gate tracking issue (non-CJK failure class) — filed as #10.
- [ ] Promote the `_WIP` proposal into the stable docs tree once stabilized.
- [x] Record the stale-source-removal criticals (observed on disable) in `docs/exec-plans/tech-debt-tracker.md`.
- [x] GitHub issue #8 response and PR #9 — commented and opened 2026-10-11.
- [x] Release v0.1.13 — tagged and published 2026-10-11.
