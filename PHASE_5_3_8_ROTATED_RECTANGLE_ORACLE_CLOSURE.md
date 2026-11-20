# PCB Studio Pro — Phase 5.3.8 Rotated Rectangle Oracle Coverage Closure

**Status: PASS** — local validation and hosted Engineering verification passed for the implementation commit.

## Branch and baseline

Work continued on `verification/phase5-3-independent-oracles-20261120`, starting at the required clean HEAD `92693d3f43fe2e30a039e19da51569cebd1bdc6e`. The requested change is committed as `df0c1e01bda5a3fd9a0afa340de506691c0ff316`. No production geometry code was changed. Changes are confined to the Phase 5.3 test oracle module and a new dedicated test file. No other branch, main, or historical ref was modified; no merge, PR, rebase, cherry-pick, or history rewrite was performed.

## Independent oracle

The test-only oracle imports no production geometry or transformation helper. It independently enumerates the rectangle’s four local corners, rotates each corner with its own scalar sine/cosine formula, translates it to the pad center, and quantizes the result to a fixed grid of `1,000,000,000` units per model coordinate unit.

On that fixed-grid convex quadrilateral, the oracle uses exact `BigInt` cross products and sign tests for point-in-polygon, exact segment intersection predicates, and rational squared point-to-segment distances. Point-to-polygon and segment-to-polygon distances are minima over the four polygon edges, with exact zero for containment/intersection. For general rotated cases, the rational result is converted to a bounded interval with an explicit fixed-grid term (`2/Q`) and a coordinate-scaled binary64 allowance (`128 × ε × scale`). An interval crossing the clearance threshold remains `AMBIGUOUS`. Exact fixed-grid threshold ties are also retained as ambiguous rather than promoted to clear.

The error interval covers fixed-grid quantization and numeric conversion under the test runtime’s binary64 arithmetic model; it is not a formal cross-engine certification of every `Math.sin`/`Math.cos` implementation. Such threshold-adjacent cases are deliberately not scored as clear or violating unless the interval resolves them.

## Fixture coverage

The suite evaluates **28 distinct DRC fixtures**, all against actual `validatePcb` results:

- **9 track-to-rotated-rectangle fixtures:** world-horizontal, world-vertical, and diagonal crossings at 31°; segment endpoint contact with a rotated edge; contact at a rotated corner; exact equality at 90°; one 0.001-coordinate-unit step below and above the threshold; and 31° rotated tangency.
- **14 via-to-rotated-rectangle fixtures:** via at the rectangle center; a near-edge case on each of four edges; a near-corner case at each of four corners; below/equal/above the threshold; and two copper diameters at the same position to verify diameter-sensitive clearance.
- **5 metamorphic fixtures:** translation, rigid rotation, reflection, uniform scaling, and track-endpoint reversal. Each transformation is checked against both the independently recomputed oracle result and `validatePcb`.

The explicit confusion matrix over determinate fixtures is **TP 17, TN 8, FP 0, FN 0**. There are **3 unresolved cases**, excluded from TP/TN/FP/FN rather than treated as passes:

| Fixture | Independent oracle | `validatePcb` | Treatment |
|---|---|---|---|
| 90° track exact-clearance equality | AMBIGUOUS | AMBIGUOUS | Unresolved; no pass/fail score |
| 31° track tangency | AMBIGUOUS | AMBIGUOUS | Unresolved; no pass/fail score |
| Via exact-clearance equality at 90° | AMBIGUOUS | CLEAR | Unresolved disagreement; not counted as a true negative |

The via-equality result is retained as a limitation: the fixed-grid oracle’s interval contains the threshold, while the current DRC reports clear. This report does not claim that boundary fixture as a confirmed pass. All 25 fixtures whose oracle intervals resolved had matching DRC classifications.

## Validation

- Focused Phase 5.3.8 suite: **1/1 test passed**, covering all 28 DRC fixtures.
- Existing Phase 5.3 oracle suite: **25/25 passed**.
- Full `pnpm test`: **109/109 passed across 9 test files**; all 108 pre-existing tests remain present and passing, plus the new closure test.
- `pnpm check`: passed.
- `pnpm build`: passed. The build emits the existing Vite notice that `/api/platform/config.js` cannot be bundled without `type="module"`; the build succeeds.
- `git diff --check`: passed before the implementation commit.

## Hosted CI

- Workflow: **Engineering verification**
- Branch: `verification/phase5-3-independent-oracles-20261120`
- Implementation commit: `df0c1e01bda5a3fd9a0afa340de506691c0ff316`
- Run ID: **44649289275**
- Run URL: <https://github.com/soheil6913/-PCB-Studio-Pro/actions/runs/44649289275>
- Result: **success** — TypeScript check, automated tests, and production build passed for the exact implementation SHA.

## Remaining limitations

This closes independent rotated-rectangle track/via DRC coverage but does not alter production geometry behavior. Three threshold-boundary fixtures are intentionally unresolved, including the via-equality disagreement; they must not be interpreted as zero-error proof. The bounded numerical envelope is explicit for the test’s fixed-grid and binary64 model but is not a formal certification of trigonometric library error on every runtime. General non-boundary cases in this fixture set were resolved and matched.
