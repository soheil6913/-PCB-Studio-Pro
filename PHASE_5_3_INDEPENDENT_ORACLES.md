# Phase 5.3 — Independent Geometry Oracle and DRC Verification

**Disposition: PASS** — the final implementation commit passed hosted engineering CI, including TypeScript checking, automated tests, and production build.

## Scope and baseline integrity

The audit targeted PCB point/segment, segment/segment, track/pad, track/track, via/track, via/pad, pad/pad, rotated-shape, and board-edge clearance behavior. The exact starting point was `02dcc4f558cfd9cac0de764fa464dd2e056f005e` (the Phase 5.2 baseline). A dedicated branch, `verification/phase5-3-independent-oracles-20261120`, was created directly at that SHA after read-only preflight. The work was confined to that branch. The preflight confirmed the working tree clean, the Phase 5.2 remote branch at the required baseline, and `origin/main` at `de7497a675af7c6212bbc4751fce098c1f414e8d`. No existing branch was checked out for editing, and no PR or merge was created.

## Defects reproduced and correction

At the pinned baseline, the independent rotated common-axis eccentric-ellipse case failed closed as `PCB_GEOMETRY_INDETERMINATE` (`AMBIGUOUS`) where its analytic separation was clear. The focused regression was run from an archive of the exact baseline and failed at `ellipse-clear-15` (`expected CLEAR; received AMBIGUOUS`).

The correction adds an analytic distance path only for oval pairs whose axes match exactly modulo 180 degrees. It transforms the center delta into the shared local frame, applies a positional tolerance derived from center-coordinate arithmetic (not pad dimensions), and computes zero overlap or the separation along the aligned axis. Cases that are not exactly common-axis, whose intermediate coordinates are non-finite, or whose dimensions are too large for safe squared support arithmetic continue through the existing GJK/fail-safe path.

A further adversarial check guards against tolerance-induced false zero: two ellipses with width `1e140`, height `2`, and a center separation of `3` along the narrow axis must be exactly `1` apart. This case failed against the first implementation commit (`4f9e10671428aa666b59fba4ad3d34de100239f7`), which returned zero because its tolerance scaled with pad size; the final implementation instead scales tolerance with center arithmetic and passes. A separate test confirms the expected half-turn symmetry at 180 degrees.

The production change is intentionally narrow. It does not claim to resolve general rotated-ellipse GJK convergence; unsupported orientations still use the existing GJK path and remain fail-closed if indeterminate.

## Independent oracle design

The test-only reference module imports no production geometry or transform helpers. Its exact cases use `BigInt` integer coordinates and rational squared distances:

- Exact orientation/cross-product predicates cover segment intersection, endpoint touch, collinear overlap, and parallel separation.
- Point-to-segment projection uses exact rational arithmetic, including endpoint clamping and zero-length segments. Segment-to-segment distance is the minimum of four exact point/segment distances, after exact intersection detection.
- Axis-aligned rectangle distances use exact integer bounds. Circle, via, and track thresholds are compared by squared-distance inequalities after doubling coordinates and radii, avoiding `sqrt` and floating-point threshold decisions.
- Shape/rotation transformations in the test fixtures are independently implemented. No production transform routine is called to generate expected geometry.
- For general ellipses, a uniform boundary-angle mesh supplies an upper witness. The lower bound subtracts the explicit Lipschitz discretization allowance `max(rx, ry) * π / N`; segment/ellipse crossing is separately tested by a normalized quadratic predicate. Ellipse/rectangle estimates use the same bounded-mesh principle. The classifier returns `AMBIGUOUS` when the interval does not establish either side of the required clearance.

The ellipse bounds account for mesh discretization; they are not interval-arithmetic proofs of IEEE-754 trigonometric rounding. Fixtures near a threshold are treated as ambiguous rather than counted as exact outcomes. Exact integer/rational results and bounded ellipse results remain clearly separated.

## Coverage and metamorphic checks

The dedicated suite contains **25 test cases**, with additional deterministic parameterized fixtures inside the cases. Coverage includes:

- Degenerate and short segments; endpoint projections; intersections, overlaps, parallel gaps, perpendicular distances, and near-parallel track pairs.
- Circle, rectangle, and oval track-to-pad checks; multiple track widths; small/large scale and short-segment cases; oval estimates with stated error intervals.
- Via copper outer diameter (not drill) against all three pad shapes; via/track endpoint and zero-length cases; exact equality; distinct via diameters and track widths; layer-span applicability; rotated oval checks.
- All nine ordered pad-shape pairings for axis-aligned references, eccentric oval separation/tangency/overlap, rotated pairs, half-turn symmetry, extreme aspect ratio, and a mixed rotated-ellipse/rectangle bounded comparison.
- Fixed-angle and deterministic seeded-angle rotations (LCG seed `0x5eed1234`), ellipse major-axis checks, rotated rectangle-corner checks, component-plus-pad transforms, and rotated shape support at all four board sides.
- Metamorphic invariance under large translation, reflection, endpoint reversal, item permutation, inverse translation, inverse/repeated rotation, and uniform scaling.
- Physical board-edge tangency and slight-outside behavior for tracks, vias, and pads, distinguished from positive edge-clearance inset rules.

The explicit FP/FN confusion-matrix sample contains **16 independently labelled fixtures**: **TP 7, TN 9, FP 0, FN 0, unresolved 0**. Thus sample sensitivity and specificity are each 100%; this is a small deterministic regression sample, not a statistical estimate of field-wide performance. The complete suite additionally performs oracle comparisons and metamorphic checks outside that 16-fixture matrix.

## Validation evidence

Final local validation on the implementation tree:

- `pnpm exec vitest run shared/phase5_3.independent-oracles.test.ts --reporter=verbose` — **25/25 passed**.
- `pnpm test` — **108/108 passed across 8 test files**, including preserved Phase 4.1.2, Phase 5.1, and Phase 5.2 suites.
- `pnpm check` — passed.
- `pnpm build` — passed.
- `git diff --check` — passed.

Hosted GitHub Actions for the final implementation commit:

- Workflow: **Engineering verification**
- Run ID: **44645857289**
- Branch: `verification/phase5-3-independent-oracles-20261120`
- Tested commit: `aa85f16376c6900d262852bc249258b7a0c7c311`
- Final status: **success** — TypeScript check, automated tests, and production build all passed.
- Run: <https://github.com/soheil6913/-PCB-Studio-Pro/actions/runs/44645857289>

The hosted log reports a Node.js 20 deprecation notice for existing Actions that were forced to run on Node.js 24; it did not affect the successful result. The local Vite build also emits the existing `/api/platform/config.js` non-module bundling warning while succeeding.

## Changed artifacts and commits

- `shared/phase5_3.independent-oracle.ts` — exact and bounded independent geometry references.
- `shared/phase5_3.independent-oracles.test.ts` — adversarial, metamorphic, DRC, and confusion-matrix regressions.
- `shared/engineering.ts` — gated common-axis oval analytic fast path and fail-safe fallback.
- `.github/workflows/engineering.yml` — enables the existing engineering workflow for `verification/**` branches.

Final implementation commit: `aa85f16376c6900d262852bc249258b7a0c7c311`. The branch was pushed to the repository; existing branches and the main branch were not modified.
