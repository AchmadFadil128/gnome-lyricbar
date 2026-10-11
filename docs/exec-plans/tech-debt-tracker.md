# Technical Debt Tracker

Track unresolved product, architecture, harness, and release debt here.

## Open Debt

- Completed lyrics HTTP requests leave stale `GLib.source_remove` cleanups in `LifecycleRegistry`, so `lifecycle.dispose()` re-removes dead sources and logs `GLib-CRITICAL: Source ID ... was not found` on extension disable. Observed 2026-10-11 during issue #8 runtime evidence (`LrclibProvider` under GJS, one critical per completed request). Fix candidate: stop tracking the timeout source id once the completion path removes it (for example, clear a mutable id to 0), and add a regression test in `tests/runtime/lifecycle.test.js` or `tests/lyrics/http-result.test.js`.

## Closed Debt

- None.
