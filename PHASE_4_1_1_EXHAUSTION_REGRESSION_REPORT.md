# Phase 4.1.1 — Real GJK Iteration Exhaustion Regression Report

## Scope

This phase corrects the Phase 4.1 regression test so it proves **actual GJK iteration-loop exhaustion**, rather than merely proving that a zero iteration budget is rejected.

No production geometry implementation was changed in this phase. The Phase 4.1 production behavior was already fail-safe; the defect was that the previous regression test did not exercise the loop.

## Regression correction

The former forced-exhaustion test used `maxIterations = 0`. The production API rejects that value before entering the GJK loop, returning `INDETERMINATE` with `iterations: 0` and reason `invalid iteration budget`. That is an invalid-configuration test, not an exhaustion test.

The replacement uses two axis-aligned oval pads:

- Pad A: center `(0, 0)`, size `10 × 4`
- Pad B: center `(2, 1)`, size `10 × 4`
- Valid GJK iteration budget: `1`

## Independent geometric oracle

The Minkowski difference of these identical axis-aligned ellipses is an ellipse with semi-axes `10` and `4`. The relative center offset is inside that ellipse because:

```text
(2 / 10)^2 + (1 / 4)^2 = 0.1025 < 1
```

Therefore the pads overlap. With the normal iteration budget, `padToPadDistanceDetailed` is expected to converge to distance `0`. This independent geometric check prevents the exhaustion fixture from depending on an assumed or fabricated distance.

## Verified regression paths

1. **Direct GJK loop:** `gjkWithinDistance(a, b, 0, 1)` enters the loop and returns exactly:
   - state: `INDETERMINATE`
   - iterations: `1`
   - reason: `iteration limit exhausted before convergence`

2. **Detailed pad distance:** `padToPadDistanceDetailed` with `gjkMaxIterations: 1` propagates `INDETERMINATE`, preserves the exhaustion reason and iteration count, and does not return a `distance` field.

3. **Invalid budget is separate:** a zero budget returns `invalid iteration budget` with zero iterations. It is no longer represented as actual loop exhaustion.

4. **Real DRC entrypoint:** `validatePcb` receives the same geometry and valid one-iteration budget. It emits `PCB_GEOMETRY_INDETERMINATE` with severity `Error`, preserves the exhaustion reason, and does not emit a normal `PCB_PAD_TO_PAD_CLEARANCE` result.

No GJK result is mocked. No fake distance, zero-distance fallback, unverified upper bound, skipped test, `it.fails`, weakened assertion, tolerance relaxation, or catch-and-ignore path is used.

## CI verification

GitHub Actions run: [44497116086](https://github.com/soheil6913/-PCB-Studio-Pro/actions/runs/44497116086)

Verified run head SHA: `b6efb9060b3ceeb422cf49a1f53ca6aba808b662`

| Check | Result |
|---|---|
| `pnpm check` | Passed |
| `pnpm test` | 5 files passed; 43 tests passed |
| `pnpm build` | Passed |

The Phase 4.1 regression suite remains intact; its updated exhaustion coverage adds one net test.

## Repository safety

- This branch was created directly from Phase 4.1 commit `6803e906aeb28b874a57cf8da9de4ecce919c468`.
- No production source file was changed in Phase 4.1.1.
- `main` remains unchanged at `de7497a675af7c6212bbc4751fce098c1f414e8d`.
- PR #1 remains open and unmerged.
- Phase 3, Phase 4, and Phase 4.1 branches remain separate.
- No new pull request was opened and no merge was performed.

## Classification

**FIXED AND VERIFIED** — the regression test now exercises genuine positive-budget GJK iteration exhaustion, and the direct, detailed-distance, and DRC paths all pass the exact CI run above.

This classification applies to the Phase 4.1.1 regression-test correction. It is not a formal proof of GJK correctness for every convex geometry and does not imply IPC, manufacturing, or electrical certification.
