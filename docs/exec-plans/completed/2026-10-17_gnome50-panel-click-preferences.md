# Plan: GNOME 50 Panel Click Preferences

Date: 2026-10-17  
Owner: ahmad fikril  
Status: completed  
Risk class: medium  
Related issue/PR: [fikrilal/gnome-lyricbar#14](https://github.com/fikrilal/gnome-lyricbar/issues/14)

## Objective

Restore "click the panel lyric to open preferences" (used when the settings icon is hidden) on GNOME Shell 50, where `PanelMenu.Button` consumes clicks through an internal `Clutter.ClickGesture` action before `button-press-event` handlers run, while keeping GNOME Shell 46–49 working.

## Constraints

- Architectural constraints:
  - Change stays in `src/shell/indicator.js`; the architecture checker's `connect`/`disconnect` marking stays intact.
  - No schema or settings changes; `setPreferencesAction()` keeps its contract for the controller.
- Product/runtime constraints:
  - One click on the lyric opens preferences when the action is set; otherwise the click stays inert (the indicator menu is never populated).
  - The built-in menu gesture is detached only when present (version-guarded through `Reflect.get`).
  - The settings indicator and its menu are unaffected.
- Out of scope:
  - Populating the lyric indicator's menu.
  - Additional gestures or keyboard shortcuts.

## Acceptance Criteria

1. `npm run verify` passes.
2. Runtime (owner, GNOME Shell 50, Wayland): with `show-settings-icon=false`, clicking the lyric opens Preferences; with the icon shown, the settings button menu opens normally.
3. No `button-press-event` wiring remains in `src/shell/indicator.js`.
4. The branch stays local until the owner confirms the runtime check; push/PR only on approval.

## Implementation Checklist

- [x] Detach the built-in menu gesture and own the click with `Clutter.ClickGesture`.
- [x] Reduce `setPreferencesAction()` to state assignment; drop the signal plumbing.
- [x] Run `npm run verify`.
- [ ] Owner post-install smoke check on GNOME Shell 50 (Wayland).
- [x] Push branch and open PR — PR #15 merged 2026-10-18.

## Decision Log

- 2026-10-17: Use the gesture swap (remove the internal gesture, add our own) instead of `captured-event` interception -> GNOME Shell 50's `panelMenu.js` consumes presses via `add_action(ClickGesture)`, verified in the installed shell; the same approach is field-proven for the identical regression in fthx/tasks-in-panel#15. `captured-event` target semantics could not be verified locally.
- 2026-10-17: Do not re-attach the internal gesture when the preferences action is unset -> the menu is empty in every state, so the toggle is imperceptible; one code path avoids per-settings action juggling.
- 2026-10-17: Extend `types/gjs.d.ts` for `Clutter.ClickGesture` and the PanelMenu action methods -> ambient declarations are the repo's established pattern for new API surface (same as the settings button style class).
- 2026-10-18: Merged without waiting for the desktop check at the owner's direction -> the runtime smoke check moved to the v0.1.14 post-install verification instead of blocking the release.

## Verification

```bash
npm run verify
```

Result:

```text
2026-10-17 — npm run verify passed (exit 0). Stage log:
- verify:docs, validate:metadata, validate:schema, check:architecture ok
- format:check, lint, typecheck ok (ambient declarations extended for the new API surface)
- vitest: 36 test files, 393 tests passed
- build:extension + validate:bundle: Bundle metadata matches repo metadata (version-name: 0.1.13)
```

## Runtime Evidence

Required: this is Shell UI behavior that static checks cannot prove.

- GNOME Shell version: 50.1 (Ubuntu 26.04), Wayland — owner check.
- Scenario(s): (1) settings icon hidden -> click the lyric -> Preferences opens; (2) settings icon shown -> settings button menu opens normally; (3) show/hide the icon repeatedly -> click behavior follows the setting without a restart.
- Artifact path(s): pending.
- Notes: pending owner confirmation; nothing is pushed until then.

## Risks And Mitigations

- Risk: a future shell renames the private `_clickGesture` field -> the version-guarded `Reflect.get` no-ops and clicks would regress to the Shell 50 behavior; revisit per shell release.
- Risk: the gesture recognizes on release instead of press -> standard click semantics; acceptable.
- Risk: competing click actions -> our gesture is the only action on older shells; on GNOME Shell 50 the built-in menu gesture is detached first.

## Completion Notes

Implemented and statically verified. Merged as PR #15 and released as v0.1.14 on 2026-10-18; the owner post-install smoke check runs after updating.

## Follow-Ups

- [x] Push branch and open PR — PR #15 merged 2026-10-18; released as v0.1.14.
- [ ] Owner post-install smoke check on GNOME Shell 50 (Wayland): hide the settings icon, click the lyric, expect Preferences.
