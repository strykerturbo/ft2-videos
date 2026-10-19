# QA run log (full runs worth remembering; compare against `BASELINE-2026-10-18.md`)

## 2026-10-18 (after "template editor 1% steps" push, commit a353573) - full run
- 307 tests (baseline 304 + SS-023, SS-024, CN-009). 292 automated/hybrid ran in ~95 s on the live exercise library.
- Automated: 278 pass (277 + CN-002 after fixing an out-of-date test), 1 fail (P-009 Minor), 13 partial.
- With the coach's manual results from the baseline (10 of 15 passed, RS-005 landscape failed/Polish, 4 not yet done): **288 pass, 2 fail (P-009 Minor, RS-005 Polish), 13 partial, 4 not tested**. Overall PARTIAL.
- Critical 0, Major 0, Minor 1 fail, Polish 1 fail.
- Versus baseline: no new app failures; CN-004 (yellow buttons differ) went Partial -> Pass; CN-002 failed only because the test did not know the new "Save Changes" button (test updated).
- Still partial (unchanged from baseline): H-012, ED-009, BN-006, DI-013, GN-013, GN-014, US-001, US-002, US-003, US-005, US-007, CN-006, RS-003.
