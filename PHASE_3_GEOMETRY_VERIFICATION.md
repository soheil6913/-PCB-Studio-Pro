# Phase 3 — Independent Geometry & DRC Verification

## Baseline and scope

- Repository: `soheil6913/-PCB-Studio-Pro`
- Pull Request: [#1](https://github.com/soheil6913/-PCB-Studio-Pro/pull/1)
- Baseline PR HEAD: `bada9965f598e6284fc81ee3580870f27ff52f09`
- Verification branch: `verify/phase3-geometry-drc-20261119`
- Main baseline: `de7497a675af7c6212bbc4751fce098c1f414e8d`

The actual PR HEAD was verified before branching and matched the requested baseline. PR #1 was open and unmerged. `main` was not modified.

## Files inspected and changed

Inspected:

- `shared/engineering.ts`
- `shared/engineering.test.ts`
- `.github/workflows/engineering.yml`
- `GEOMETRY_TEST_REPORT.md`

Changed on this verification branch:

- `shared/phase3.geometry.test.ts`
- `PHASE_3_GEOMETRY_VERIFICATION.md`

No production source, UI, branding, RTL/LTR behavior, persistence, existing tests, or geometry algorithm was changed. The existing implementation was preserved after the defects below were independently reproduced.

## Independent methodology

The new tests use analytic oracles rather than calling internal distance helpers as references. Axis-aligned rectangle distances are calculated from edge separation. Circle-to-rectangle distance is independently calculated as `max(0, circleCenter - radius - rectangleEdge)`. Same-orientation rotated rectangles use rigid-transform invariance: translating two equal rectangles along their common local x-axis by `16` with width `10` produces an expected gap of `16 - 5 - 5 = 6`. Oval cases use their known semi-axis separations where the centers lie on a principal axis.

Rotation tests independently calculate transformed points for `0°`, `45°`, `90°`, `180°`, `270°`, `-90°`, and `360°`, then check combined component-plus-pad rotation against a world-space rectangle fixture. DRC tests use deterministic geometry for crossing, tangency, containment, zero-length tracks, layer filtering, edge clearance, minimum width, minimum drill, and annular ring.

The two known GJK discrepancies are represented as explicit `it.fails` regression probes. This keeps the complete test command green while preserving the fact that the implementation does not meet those independent numerical oracles.

## Numerical results

| Case | Independent expected distance | Actual distance | Absolute error | Relative error | Result |
|---|---:|---:|---:|---:|---|
| Axis-aligned rectangle vs rectangle | `6` | `6.000000000000071` | `7.1e-14` | `1.18e-14` | Pass |
| Circle vs rectangle | `1` | `1` | `0` | `0` | Pass |
| Circle vs oval on principal axis | `1` | `1` | `0` | `0` | Pass |
| Oval vs oval on principal axis | `4` | `4.00000000000005` | `5e-14` | `1.25e-14` | Pass |
| Same rectangles, both rotated `45°` | `6` | `5.44732325149112` | `0.5526767485088797` | `0.09211279141814661` | **Fail** |
| Large coordinates / very different sizes | `899999` | `893860.118094885` | `6138.881905114977` | `0.006820987473447167` | **Fail** |

Containment, identical centers, complete overlap, exact tangency, very small positive separation (`1e-8`), and very small penetration (`-1e-8`) passed their deterministic assertions. The track, via, pad-to-pad, layer, board-edge, minimum-width, minimum-drill, and annular-ring DRC checks in the Phase 3 suite also passed.

## Discovered defects

### DEF-001 — GJK underestimates same-orientation rotated rectangle distance

Severity: High for numerical DRC accuracy.

Reproduction:

1. Create two rectangular pads with width `10`, height `4`, both rotated `45°`.
2. Place their centers `16` units apart along their common rotated local x-axis: `(0,0)` and `(16/sqrt(2),16/sqrt(2))`.
3. The independent expected boundary gap is `16 - 5 - 5 = 6`.
4. Call `padToPadDistance`.

Observed result: `5.44732325149112`, an absolute error of `0.5526767485088797` and relative error of approximately `9.21%`.

Likely cause: the current GJK/simplex distance decision is numerically inaccurate for this rotated convex-rectangle configuration. No production correction was applied in this phase because a safe replacement or normalization strategy requires a separate impact analysis across all shape combinations.

### DEF-002 — GJK loses accuracy at large coordinate magnitudes and different object scales

Severity: High for designs using large absolute coordinates or highly different pad sizes.

Reproduction:

1. Create a `2 x 2` rectangle centered at `(1_000_000_000, 1_000_000_000)`.
2. Create a `200_000 x 200_000` rectangle centered at `(1_001_000_000, 1_000_000_000)`.
3. The independent axis-aligned expected gap is `1_000_000 - 1 - 100_000 = 899999`.
4. Call `padToPadDistance`.

Observed result: `893860.118094885`, an absolute error of `6138.881905114977` and relative error of approximately `0.6821%`.

Likely cause: cancellation and/or insufficiently stable support/simplex operations when absolute coordinates are large relative to the separation geometry. No production correction was applied in this phase.

## Fixed and unfixed issues

Fixed in this phase: none. This was intentionally a verification-only phase, and no production algorithm was changed.

Unfixed: DEF-001 and DEF-002 remain reproducible and are explicitly recorded above. The existing test suite did not previously cover these independent numerical oracles.

The initial run also exposed four incorrectly constructed temporary fixtures; they were corrected in the new test file before the final verification run. They were test-authoring errors, not product defects.

## Local validation

The focused Phase 3 suite completed with `7` tests reported as passed by Vitest. Five are ordinary passing checks; two are expected-failure probes that pass because the known defects reproduce as expected.

Required project commands will be run on the committed branch:

- `pnpm check`
- `pnpm test`
- `pnpm build`

## CI and limitations

GitHub Actions status and run URL will be recorded after this branch is pushed. The CI workflow verifies TypeScript, automated tests, and production build; a green CI result does not remove the two numerical defects documented above.

This phase does not establish IPC compliance, manufacturing readiness, Gerber/KiCad export correctness, external footprint-library correctness, thermal/electrical/impedance simulation, or formal proof of GJK correctness. Unknown layer spans remain explicitly unknown; no cross-layer connectivity is inferred from missing data.

## Final recommendation

**FAILED — defects remain.**

The tested axis-aligned, mixed-shape, rotation-transform, track, via, layer, and rule-boundary cases pass, but independent numerical verification found material GJK distance errors for rotated rectangles and large-coordinate/different-scale rectangles. PR #1 must not be considered fully geometry-verified until these cases receive a separately reviewed correction or an explicitly accepted limitation.
