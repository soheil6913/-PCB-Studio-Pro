# PHASE 6.1 — P2.4-D-1 Geometry Options Remediation Report

## Final verdict

**ACCEPTED_WITH_LIMITATIONS**

This report covers only the confirmed geometry-options validation inconsistency from the P2.4-C reference. It does not claim completion of P2.4-D and does not authorize integration into `main`.

## 1. Baseline and branch verification

- Repository: `soheil6913/PCB`
- Authoritative source baseline: `327fc0479031279b889ea1dd1140a23d4abe442f`
- Baseline subject: `Remediate P2.4-C numerical uncertainty`
- Baseline parent: `21b7487eec431dcb993a44d0d642a33644141526`
- Implementation branch: `fix/phase6-1-p2-4-d-1-geometry-options-validation`
- Branch base: exactly `327fc0479031279b889ea1dd1140a23d4abe442f`
- Implementation commit: `941262899a46e54cbf1a94a4da6dd528b8d36780`

The implementation was performed in a fresh worktree created directly from the verified baseline. `main` was not modified, P2.4-C was not merged into `main`, and no unrelated numerical geometry algorithm was changed.

## 2. Exact source changes

### Production source: `shared/engineering.ts`

1. Added one pure predicate:

   ```ts
   function validGjkMaxIterations(value: unknown): value is number {
     return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
   }
   ```

2. Changed `validRuntimeGeometryOptions` to use that predicate for an explicitly present `gjkMaxIterations` value. Structural option handling is unchanged: omitted options and an empty object remain valid, while non-objects, arrays, unknown fields, and invalid explicit values remain invalid.

3. Changed canonical `validateGeometryOptions` to use the same predicate while preserving its structured validation error:

   ```text
   path: options.gjkMaxIterations
   message/correction: must be a positive safe integer
   ```

4. Options are still validated at the beginning of `padToPadDistanceDetailed`, before analytic or iterative geometry dispatch.

5. The direct scalar `gjkWithinDistance` validation was not changed.

### Tests

- Updated the established P2.4-B detailed-API assertions for zero and fractional object options. Their intentional new classification is `invalid geometry options` at the options boundary.
- Updated the established GJK convergence assertion for the detailed object-options path. The direct scalar assertion remains `invalid iteration budget`.
- Added `shared/phase6-1-p2-4-d-1-geometry-options-validation.test.ts` covering every required invalid value, every required valid positive-safe-integer representative, explicit undefined versus omission, both validation boundaries, analytic-path ordering, and preserved scalar GJK classification.

## 3. Before/after classification matrix

| Input or path | Before remediation in P2.4-C reference | After remediation | Compatibility result |
|---|---|---|---|
| Omitted options | Accepted | Accepted | Preserved |
| `undefined` options argument | Accepted | Accepted | Preserved |
| `{}` | Accepted | Accepted | Preserved |
| `{ gjkMaxIterations: undefined }` | Runtime validator admitted it; canonical validator rejected it | Direct detailed: `INDETERMINATE`, `invalid geometry options`; `validatePcb`: `PCB_INVALID_OPTIONS`, positive-safe-integer correction | Corrected and aligned |
| `NaN` | Runtime validator admitted it and later GJK classified it as invalid budget | Direct detailed: `INDETERMINATE`, `invalid geometry options`; `validatePcb`: `PCB_INVALID_OPTIONS` | Corrected and aligned |
| `Infinity` | Runtime validator admitted it and later GJK classified it as invalid budget | Direct detailed: `INDETERMINATE`, `invalid geometry options`; `validatePcb`: `PCB_INVALID_OPTIONS` | Corrected and aligned |
| `0` | Runtime validator admitted it and later GJK classified it as invalid budget | Direct detailed: `INDETERMINATE`, `invalid geometry options`; `validatePcb`: `PCB_INVALID_OPTIONS` | Corrected; intentional diagnostic change |
| Negative integer | Runtime validator admitted it and later GJK classified it as invalid budget | Direct detailed: `INDETERMINATE`, `invalid geometry options`; `validatePcb`: `PCB_INVALID_OPTIONS` | Corrected and aligned |
| Fractional number | Runtime validator admitted it and later GJK classified it as invalid budget | Direct detailed: `INDETERMINATE`, `invalid geometry options`; `validatePcb`: `PCB_INVALID_OPTIONS` | Corrected; intentional diagnostic change |
| Unsafe integer | Runtime validator rejected it; canonical validator rejected it | Same rejection and classifications | Preserved |
| Non-numeric value | Runtime validator rejected it; canonical validator rejected it | Same rejection and classifications | Preserved |
| Null, array, or non-object options | Runtime validator rejected it; canonical validator rejected it | Same rejection and classifications | Preserved |
| Unknown option field | Runtime validator rejected it; canonical validator returned structured unknown-field error | Same rejection and classifications | Preserved |
| Positive safe integer `1`, `64`, `257`, `Number.MAX_SAFE_INTEGER` | Accepted | Accepted | Preserved |
| Valid positive budget that exhausts GJK | `INDETERMINATE`, `iteration limit exhausted before convergence` | Same | Preserved |
| Direct scalar `gjkWithinDistance` with invalid budget | `invalid iteration budget` | Same | Preserved by design |

`validatePcb` continues to return `PCB_INVALID_OPTIONS` with Error severity and the canonical positive-safe-integer correction before geometry evaluation. No malformed object option produces a finite detailed distance or a DRC clearance pass.

## 4. Regression results

All required verification completed on the implementation branch.

### Focused remediation and compatibility suites

Command:

```text
pnpm exec vitest run \
  shared/phase6-1-p2-4-a-boundary-safety.test.ts \
  shared/phase6-1-p2-4-b-geometry-api-contract.test.ts \
  shared/phase4_1.gjk-convergence.test.ts \
  shared/phase6-1-p2-4-c-numerical-uncertainty.test.ts \
  shared/phase6-1-p2-4-d-1-geometry-options-validation.test.ts
```

Result:

```text
5 test files passed
82 tests passed
```

### Full repository test suite

Command:

```text
pnpm test
```

Result:

```text
18 test files passed
266 tests passed
```

### TypeScript check

Command:

```text
pnpm run check
```

Result:

```text
tsc --noEmit completed successfully
```

### Diff hygiene

`git diff --check` passed. The implementation commit contains exactly four intended files:

```text
M shared/engineering.ts
M shared/phase4_1.gjk-convergence.test.ts
M shared/phase6-1-p2-4-b-geometry-api-contract.test.ts
A shared/phase6-1-p2-4-d-1-geometry-options-validation.test.ts
```

Implementation commit statistics:

```text
4 files changed, 134 insertions(+), 6 deletions(-)
```

The existing source checkout used for the initial inspection had an unrelated damaged working-tree state, so the implementation was intentionally performed in a clean worktree from the verified commit. No files from that damaged checkout were copied or edited.

## 5. Compatibility analysis

The correction is intentionally narrow. It changes only the classification stage and reason for malformed numeric values that the old runtime predicate incorrectly admitted. The result remains non-throwing and fail-closed: `padToPadDistanceDetailed` returns an `INDETERMINATE` result without a distance, and `validatePcb` emits `PCB_INVALID_OPTIONS` before evaluating geometry.

The wrapper contracts remain unchanged. `padToPadDistance` still throws `GeometryCalculationError` when its detailed result is indeterminate. `viaToPadDistance` was not changed. Existing valid Circle/Oval results remain covered by the full suite.

Positive-budget GJK exhaustion is still distinct from invalid options. A valid positive budget that cannot converge returns `INDETERMINATE` with `iteration limit exhausted before convergence`; the DRC path continues to emit `PCB_GEOMETRY_INDETERMINATE` and does not emit a false clearance pass.

The direct scalar GJK API deliberately remains independent. Its existing guard still reports `invalid iteration budget` for invalid scalar budgets, and focused tests verify that behavior. This remediation does not impose the object-options contract on that API.

The two changed existing expectations are intentional contract corrections, not incidental test rewrites: zero and fractional values supplied through the object-options API must be rejected at the options boundary. The direct scalar diagnostic remains unchanged.

## 6. Remaining limitations

1. This patch does not implement or certify arbitrary-angle trigonometry, checked transforms, binary64 output-cell certification, or certified rectangle/oval distance evaluation.
2. This patch does not change the current `main` branch or integrate P2.4-C.
3. The direct scalar GJK validator remains a separate contract and was not changed; in particular, this task does not broaden its validation to the object-options predicate.
4. This task does not introduce coordinate, dimension, rotation, or geometry-domain limits.
5. The branch and implementation are ready for code review of this targeted correction, but broader P2.4-D implementation remains outside the accepted scope of this report.

## 7. Conclusion

The confirmed P2.4-C geometry-options inconsistency was corrected with one shared pure positive-safe-integer predicate. Canonical and runtime object-option validation now enforce the same contract, structured canonical errors are preserved, validation remains before analytic/iterative dispatch, direct scalar GJK classification is preserved, and all focused and full regression checks pass.

**ACCEPTED_WITH_LIMITATIONS**
