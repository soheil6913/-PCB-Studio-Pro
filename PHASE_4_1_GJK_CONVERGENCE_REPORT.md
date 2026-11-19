# Phase 4.1 — GJK Convergence Safety & DRC Fail-Safe

## Verified baseline

- Repository: `soheil6913/-PCB-Studio-Pro`
- PR #1: [open and unmerged](https://github.com/soheil6913/-PCB-Studio-Pro/pull/1)
- PR #1 HEAD, unchanged: `bada9965f598e6284fc81ee3580870f27ff52f09`
- Main, unchanged: `de7497a675af7c6212bbc4751fce098c1f414e8d`
- Phase 3 branch, unchanged: `ecea3aa58479c61dcb8e6114aa058187d03db6fa`
- Phase 4 branch, unchanged: `ab6658677929d172b7805467eeb05a4db3faead8`
- Phase 4.1 branch: `fix/phase4-1-gjk-convergence-safety-20261119`

This branch was created directly from the Phase 4 commit. No Phase 3, PR #1, or main commits were merged into the implementation branch.

## Root cause of the previous false-positive convergence

The previous `gjkWithinDistance` function returned a boolean and unconditionally returned `true` after its iteration loop. Iteration exhaustion, repeated support points, non-finite intermediate values, and unresolved degenerate simplices were therefore indistinguishable from a valid `WITHIN_DISTANCE` result.

`padToPadDistance` used that boolean in its binary search. A false positive could move the upper search bound downward and produce an underestimated clearance. In DRC this could hide a real pad-to-pad violation.

## New convergence-state model

The production function now returns a discriminated `GjkDecision`:

```text
WITHIN_DISTANCE
OUTSIDE_DISTANCE
INDETERMINATE
```

Each result includes the iteration count and a deterministic termination reason. `INDETERMINATE` is returned for:

- invalid iteration budgets;
- non-finite directions, support points, dot products, or simplex values;
- unresolved duplicate support points with a non-zero residual;
- non-finite simplex directions;
- iteration exhaustion before convergence.

A duplicate support point is treated as convergence only when its residual is numerically zero under a scale-aware machine-precision bound. It is not treated as safe merely because the simplex stopped changing.

## Distance and binary-search propagation

`padToPadDistanceDetailed` now returns either a converged numeric distance or an explicit indeterminate result. The binary search updates bounds only for valid `WITHIN_DISTANCE` and `OUTSIDE_DISTANCE` results. If any query is indeterminate, the search stops and returns `INDETERMINATE`; it does not return the current upper bound.

The compatibility function `padToPadDistance` preserves the existing numeric API for converged geometry. If the calculation is indeterminate, it throws `GeometryCalculationError` instead of returning zero or a fabricated finite distance.

## DRC fail-safe integration

`validatePcb` uses `padToPadDistanceDetailed` for pad-to-pad checks. An indeterminate geometry result creates an explicit `Error` finding:

```text
ruleId: PCB_GEOMETRY_INDETERMINATE
```

The finding explains that clearance could not be verified and instructs the user not to accept the board until the calculation converges. It does not create a normal clearance violation with a fabricated distance, and it does not silently pass the rule.

A deterministic `GeometryOptions.gjkMaxIterations` parameter is available to tests and controlled callers. Normal application calls use the default budget; the test path forces zero iterations to prove fail-safe behavior.

## Numerical safeguards

The implementation preserves the Phase 4 local-origin normalization and shape-specific exact paths. The GJK path additionally validates every finite intermediate, detects near-zero directions, uses a scale-aware residual tolerance for duplicate supports, and distinguishes an unresolved simplex from a valid enclosure.

The residual tolerance is based on machine epsilon and the squared local shape scale rather than the broad `EPSILON=1e-7` used by unrelated legacy predicates. This avoids collapsing small positive gaps into tangency while allowing a mathematically zero residual to converge deterministically.

## Regression tests and independent references

`shared/phase4_1.gjk-convergence.test.ts` adds ordinary passing tests for:

- normal Oval–Oval separation;
- Oval–Oval tangency;
- Oval–Oval overlap;
- very small positive gaps;
- very small penetration;
- large absolute coordinates with representable small relative separation;
- large shape-size differences;
- independently rotated Oval–Oval pads;
- identical/repeated-support geometry;
- forced iteration exhaustion;
- DRC behavior when geometry is indeterminate.

The expected axis-aligned distances are independent analytical values based on ellipse semi-axis separation. The large-coordinate small-gap expectation uses the exact representable IEEE-754 input value rather than claiming that an unrepresentable decimal `1e-6` survives at magnitude `1e9`.

Phase 4 regression tests remain intact and continue to cover both original numerical defects, mixed shapes, rotations, and DRC boundaries. No `it.fails`, skipped test, mocked distance, relaxed assertion, or catch-and-ignore path is used.

## Before/after forced non-convergence behavior

Before Phase 4.1:

```text
iteration limit exhausted -> true
binary search -> treats result as WITHIN_DISTANCE
DRC -> could accept an underestimated clearance
```

After Phase 4.1:

```text
forced maxIterations=0 -> INDETERMINATE
binary search -> stops and propagates INDETERMINATE
DRC -> PCB_GEOMETRY_INDETERMINATE, severity Error
normal converged geometry -> ordinary numeric distance and normal DRC rules
```

The regression test asserts that the forced DRC path emits `PCB_GEOMETRY_INDETERMINATE` and does not emit a normal `PCB_PAD_TO_PAD_CLEARANCE` result.

## Required command results

```text
pnpm check
passed

pnpm test
5 test files passed
42 tests passed

pnpm build
passed
```

The build retains the existing Vite warning about `/api/platform/config.js` lacking `type="module"`; the production build still completes successfully.

## Changed files

- `shared/engineering.ts` — explicit convergence states, safe binary search, geometry error propagation, and fail-safe DRC diagnostic.
- `shared/phase4_1.gjk-convergence.test.ts` — ordinary convergence and DRC safety regressions.
- `PHASE_4_1_GJK_CONVERGENCE_REPORT.md` — this report.

No UI, branding, RTL/LTR, persistence, workspace workflow, or unrelated application feature changed.

## Remaining limitations

This is a deterministic safety correction, not a formal proof of GJK correctness for every convex configuration. The public numeric wrapper throws for indeterminate geometry; callers that require diagnostics should use `padToPadDistanceDetailed`. The current fail-safe DRC extension covers pad-to-pad geometry; other exact shape-specific DRC paths remain governed by their existing deterministic algorithms.

This work does not claim IPC compliance, manufacturing readiness, Gerber/KiCad export correctness, external footprint-library correctness, thermal/electrical/impedance simulation, or certification.

## Final classification

**FIXED WITH LIMITATIONS**

The previous false-positive convergence path is eliminated, forced non-convergence is explicit and fail-safe, and all required local tests pass. The remaining limitation is the absence of a formal proof across every possible geometry configuration.

GitHub Actions run URL and the final commit SHA will be appended after this isolated branch is pushed.
