# PCB Studio Pro — Phase 5.2 DRC Adversarial Audit

## Status

**PHASE 5.2 COMPLETE — ALL CONFIRMED TARGETED DEFECTS FIXED**

The status means the confirmed, reproduced defects listed below were corrected and the prescribed local test, type-check, build, and CI evidence passed. It does **not** claim a mathematical proof of every geometry routine.

## Baseline and branch

- Repository: `soheil6913/-PCB-Studio-Pro`
- Required baseline SHA: `44ba96ef5a031802a538566f9d1b33452fdf7950`
- Required baseline branch at start: `fix/phase5-1-geometry-validation-20261119`
- Working branch: `fix/phase5-2-drc-adversarial-geometry-20261120`
- Working branch was created directly at the required baseline; starting worktree was clean.
- Implementation commit: `37cb3a702840a9b44ffe81af3c5ab6a1dd050c3d` (`fix(drc): harden adversarial geometry clearance checks`)
- No merge, cherry-pick, rebase, PR, or changes to `main`, Phase 5.1, or historical/audit branches were made.

## Files changed

- `shared/engineering.ts`
- `shared/phase5_2.drc-adversarial.test.ts`
- `PHASE_5_2_DRC_ADVERSARIAL_AUDIT.md` (this report)

No dependency, UI, branding, or project-file-format changes were made.

## DRC paths audited

Read-only audit covered track-to-track segment intersection/distance; track-to-pad circle, oval, and rotated rectangle clearances; pad-to-pad exact dispatch and GJK; via-to-track and via-to-pad clearances and layer filters; board-edge checks for tracks, pads, and vias; public validation and aggregate DRC propagation. Call sites in `shared/engineering.ts` were reviewed. Phase 4, Phase 4.1.2 GJK convergence/exhaustion, and Phase 5.1 tests were preserved unchanged.

## Confirmed defects and fixes

1. **Track-to-track overflow false negative.** `orientation` multiplied raw coordinate differences; determinant products could overflow for finite extreme inputs, allowing crossing tracks to be classified as non-intersecting. The resulting endpoint distance could suppress `PCB_TRACK_CLEARANCE`. The predicate now scales differences before determinant products and falls back to scaled coordinates if subtraction itself overflows. A fixture with exact crossing diagonals at coordinates `±1e200` checks the independent intersection at `(0,0)`, zero distance, and DRC propagation.

2. **Rect–oval non-finite distance silently marked converged.** The exact-distance constructor now returns `INDETERMINATE` rather than `CONVERGED` when a distance is negative or non-finite. Pad-to-pad DRC also guards derived results before comparison and reports `PCB_GEOMETRY_INDETERMINATE` instead of silently passing a `NaN` result.

3. **Clearance tolerance addition overflow.** The former `actual + tolerance < required` form could overflow and suppress a shortfall. Comparisons now avoid that addition and classify results as clear, violation, or indeterminate. A shortfall inside the numeric uncertainty band produces an Error-level `PCB_GEOMETRY_INDETERMINATE`, not a silent pass. The same fail-safe comparison is used for track-track, track-pad, pad-pad, via-pad, track-via, and via-via paths.

4. **Missing pad-to-board-edge rule.** A new `PCB_PAD_EDGE_CLEARANCE` Error checks transformed circle, oval, and rotated rectangle copper bounds, including component and pad rotation, against the required board inset. Findings identify the component and pad.

5. **Fixed absolute board-edge tolerance.** The fixed `1e-7` allowance in `boardContains` could accept track/via copper outside the required inset. It was removed; exact inset is accepted and a representable sub-`1e-7` shortfall is flagged.

No unsupported change was made to GJK iteration/exhaustion semantics. Existing explicit `INDETERMINATE` handling and iteration-budget behavior remain covered by the preserved Phase 4.1.2 tests.

## Hypotheses and unconfirmed items

No concrete false result was demonstrated for track-to-pad oval/rotated-rectangle paths under ordinary finite geometry, so those were not classified as bugs. No verified via-to-track or via-to-pad geometry/layer defect was demonstrated. Risks for extreme arithmetic in untested branches were treated as fail-safe/coverage concerns, not confirmed defects. The audit also notes that the input schema permits finite extreme magnitudes beyond practical PCB dimensions.

## Remaining coverage gaps and numeric risks

- Broader independent oracles are warranted for eccentric/rotated oval track-to-pad and via-to-pad distances.
- Via-track endpoint/interior projection, zero-length and reversed segments, layer-filter, and exact tangency coverage could be expanded.
- General rotated convex pad pairs would benefit from independent high-precision distance oracles and broader metamorphic tests.
- Classification within the clearance comparator's machine-precision uncertainty band is deliberately conservative: it becomes `PCB_GEOMETRY_INDETERMINATE` and may require user review rather than asserting a violation or a pass.
- Finite but physically implausible extreme values remain permitted by the schema; this work makes audited computations fail closed, but does not define a new global supported-coordinate bound.

These gaps do not negate the fixes for the five reproduced defects and do not amount to a proof of all geometry calculations.

## New adversarial tests and independent oracles

`shared/phase5_2.drc-adversarial.test.ts` adds ten checks:

- Track crossing uses two exact line segments with opposite slopes that both contain the origin; this is independent of the production distance result.
- Rect–oval overflow asserts a converged result must be finite and checks end-to-end DRC emits either a clearance Error or an indeterminate Error.
- Circle-pad separation uses the analytic oracle `centerDistance - radiusA - radiusB`; it asserts the representable shortfall is not silently accepted.
- Pad edge checks use support extents for circle, rotated oval, and rotated rectangle fixtures, with component/pad IDs.
- Track edge tests compare exact inset with a representable shortfall; via edge uses the analytic radius-plus-edge inset.
- Existing invalid via-layer aggregate propagation remains asserted.

Each reported defect regression was run against a clean archive of the exact required baseline, then against the corrected tree. The new Phase 5.2 file had **7 failing checks and 3 passing checks on baseline**; after fixes it had **10 passing checks**.

## Verification

- Focused geometry matrix: **5 files, 77 tests passed** (core engineering, Phase 4 GJK, Phase 4.1.2 convergence, Phase 5.1, Phase 5.2).
- Full `pnpm test`: **7 files, 83 tests passed**.
- `pnpm check`: passed.
- `pnpm build`: passed. Vite emitted its existing notice that `/api/platform/config.js` cannot be bundled without `type="module"`; build completed successfully.
- `git diff --check`: passed.
- Baseline contrast: **7 failing checks / 3 passing checks** on the Phase 5.2 test file against a clean archive at `44ba96ef5a031802a538566f9d1b33452fdf7950`.

## GitHub Actions

- Workflow: **Engineering verification**
- Implementation SHA: `37cb3a702840a9b44ffe81af3c5ab6a1dd050c3d`
- Run: [GitHub Actions run 44626692100](https://github.com/soheil6913/-PCB-Studio-Pro/actions/runs/44626692100)
- Status: **success**. The `verify` job passed dependency installation, TypeScript check, automated tests, and production build.

## Final limitation

All confirmed targeted defects identified in this audit were corrected on the isolated Phase 5.2 branch. Remaining test gaps and finite-extreme-range assumptions are stated above. No mathematical completeness claim is made; no merge or change to `main` was performed.
