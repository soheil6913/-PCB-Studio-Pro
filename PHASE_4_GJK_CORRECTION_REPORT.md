# Phase 4 — GJK Numerical Stability & Geometry Correction

## Verified baseline

- Repository: `soheil6913/-PCB-Studio-Pro`
- Existing PR: [#1](https://github.com/soheil6913/-PCB-Studio-Pro/pull/1)
- PR #1 HEAD used as implementation baseline: `bada9965f598e6284fc81ee3580870f27ff52f09`
- Main: `de7497a675af7c6212bbc4751fce098c1f414e8d`
- Phase 3 verification branch preserved separately at `ecea3aa58479c61dcb8e6114aa058187d03db6fa`
- Phase 4 branch: `fix/phase4-gjk-numerical-stability-20261119`

The PR state, base, head, main SHA, and Phase 3 SHA were fetched and verified before branching. This implementation branch was created directly from PR #1 HEAD; Phase 3 verification-only commits were not merged into it.

## Changed files

- `shared/engineering.ts` — production geometry correction.
- `shared/phase4.gjk.test.ts` — ordinary passing regressions for both original defects and mixed-shape coverage.
- `PHASE_4_GJK_CORRECTION_REPORT.md` — this report.

No UI, branding, RTL/LTR, persistence, unrelated workflow, or application behavior was changed. PR #1's existing branch was not modified.

## Root causes

### DEF-001 — rotated rectangle distance

The former implementation used a boolean `gjkWithinDistance` predicate plus scalar bisection for every non-circle pair. For two equal rectangles rotated `45°` and separated by `16` units along the shared local x-axis, the expected gap is `16 - 5 - 5 = 6`. The former result was `5.44732325149112`, an absolute error of `0.5526767485088797` or approximately `9.21%`.

The issue was not the pad/component rotation transform. It was the use of the iterative GJK/simplex decision path for an oriented-rectangle pair where an exact convex-polygon distance is available. The simplex termination classified a clearance-expanded Minkowski configuration too early and the bisection treated that classification as an accurate distance boundary.

### DEF-002 — large coordinates and different scales

The former implementation operated directly on absolute pad coordinates in support points, Minkowski subtraction, dot products, and simplex updates. At centers near `1e9`, subtractive cancellation reduced the accuracy of the small relative geometry. For a `2 x 2` pad at `(1e9,1e9)` and a `200000 x 200000` pad at `(1e9+1000000,1e9)`, the expected gap is `899999`; the former result was `893860.118094885`, an absolute error of `6138.881905114977` or approximately `0.6821%`.

The issue was numerical conditioning, not a project-coordinate validation error.

## Correction strategy

A hybrid strategy was selected rather than blindly replacing GJK:

1. Circle–circle remains the exact center-distance formula.
2. Circle–rectangle and circle–oval continue to use the exact point-to-shape boundary calculation minus circle radius.
3. Rectangle–rectangle now uses exact rotated convex-polygon geometry: transformed corners, strict local orientation predicates, edge-to-edge segment distance, and containment/intersection detection.
4. Rectangle–oval now uses the actual rotated ellipse boundary and the four transformed rectangle edges, including containment detection.
5. Remaining oval–oval GJK calculations are translated to a local origin at the pair midpoint before support/simplex operations, avoiding unnecessary large absolute coordinates. The bisection iteration limit was increased from `40` to `64` for deterministic convergence margin.
6. The strict rect predicates use a local `1e-12` geometric predicate tolerance rather than the broader general-purpose `EPSILON=1e-7`, preserving a real `1e-8` positive rectangle gap.

This keeps the existing supported shape model while selecting analytical or polygon methods where they are more reliable than iterative GJK.

## Independent reference and before/after results

The reference values below are analytical and were not calculated using the production GJK implementation.

| Case | Independent expected | Before | After | After abs. error | Result |
|---|---:|---:|---:|---:|---|
| Rotated Rect–Rect, common-axis gap | `6` | `5.44732325149112` | `5.999999999999999` | `< 1e-15` | Fixed |
| Large-coordinate Rect–Rect | `899999` | `893860.118094885` | `899999` | `0` | Fixed |
| Circle–Rect, axis gap | `1` | `1` | `1` | `0` | Preserved |
| Circle–Oval, principal-axis gap | `1` | `1` | `1` | `0` | Preserved |
| Oval–Oval, principal-axis gap | `4` | `4.00000000000005` | `4` | `0` within displayed precision | Preserved |
| Rotated Rect–Oval, common-axis gap | `6` | `5.861343695550761` | `6` | `0` | Corrected during Phase 4 |

The independent regression fixtures also cover identical centers, containment, overlap, tangency, very small positive separation, very small penetration, rotated geometry, negative and equivalent rotations, component/pad transformation behavior, and DRC threshold boundaries.

## DRC regression coverage

Existing DRC tests were preserved and passed. Phase 4 additionally verifies that the correction preserves:

- Track-to-pad threshold behavior on a rotated oval.
- Via-to-pad behavior on rotated rectangles.
- Mixed-shape pad-to-pad distances.
- Layer-specific filtering.
- Board-edge clearance.
- Minimum track width.
- Minimum drill diameter.
- Minimum annular ring.
- Unknown/missing via layer-span handling.
- Tangency and tiny-gap behavior.

No cross-layer connectivity is inferred from missing layer-span data.

## Test results

Local results after correction:

```text
pnpm check
passed

pnpm test
4 test files passed
37 tests passed

pnpm build
passed
```

The production build retains the existing Vite warning about `/api/platform/config.js` lacking `type="module"`; it does not affect build completion. No test uses `it.fails`, skipped tests, mocked distances, or relaxed assertions to hide the original failures.

GitHub Actions verification: [run 44489911395](https://github.com/soheil6913/-PCB-Studio-Pro/actions/runs/44489911395) completed with `success` for commit `2c3ee2d4b47ec95196d80fe21d70c9985844dbe8`.

## Remaining limitations

This correction does not constitute formal proof of GJK correctness for every possible convex configuration. The hybrid implementation is verified within the deterministic shape, rotation, scale, and DRC cases listed above. It does not establish IPC compliance, manufacturing readiness, Gerber/KiCad export correctness, external footprint-library correctness, thermal/electrical/impedance simulation, or production certification.

## Final classification

**FIXED WITH LIMITATIONS**

Both original defects were independently reproduced, corrected with ordinary passing regression tests, and rechecked without modifying PR #1 or `main`. The remaining limitation is the absence of a formal proof and exhaustive numerical certification over all possible geometry configurations.
