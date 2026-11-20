# PCB Studio Pro — Phase 5.4 DRC Boundary Semantics

## Scope and isolation

- Repository: `soheil6913/-PCB-Studio-Pro`
- Branch: `verification/phase5-4-drc-boundary-semantics-20261120`
- Initial baseline: `ce4d8b9325d92c2efcb90c6deef56e1070650e43`
- Final report-bearing commit: pending
- Scope: independent tests and documentation only; no production implementation was changed.
- No main-branch edits, merge, rebase, cherry-pick, PR, or historical rewrite was performed.
- Existing Phase 5.3 and Phase 5.3.8 files remain unchanged.

## Changed files

- `shared/phase5_4.drc-boundary-semantics.test.ts` — independent DRC boundary, interaction, layer, metamorphic and board-edge suite (5 test cases, 61 labeled cross-primitive ledger fixtures plus supplemental applicability/boundary checks).
- `PHASE_5_4_DRC_BOUNDARY_SEMANTICS.md` — this audit report.

## Findings and semantic status

### Verified behavior

The existing validator treats equality as acceptable when its numerical comparison can resolve it: a measured distance at or above the configured threshold is clear; a value below threshold is a violation, except when the difference lies within the comparator’s floating-point uncertainty band, in which case it emits `PCB_GEOMETRY_INDETERMINATE`. This contract is explicitly tested for track/pad threshold equality, just-below/above values, a shortfall inside the 16-epsilon tolerance, and a shortfall beyond it.

The test-only exact oracle checks six configured pair families: track-track, track-via, track-pad (circle and axis-aligned rectangle), via-via, via-pad (circle and rectangle), and pad-pad (circle-circle and rectangle-rectangle). For these integer fixed-grid fixtures, segment/point-to-segment distance predicates use `BigInt` exact squared-distance comparisons; circles use exact center distance against summed diameters plus clearance; axis-aligned rectangles use exact doubled-coordinate gaps. Layer applicability tests establish that tracks on opposite copper layers do not clash, front-only pads are not tested against back-layer tracks, pads with explicit both-layer spans and plated through-hole fallback are applicable, and vias with absent span metadata are conservatively excluded from span-dependent via-to-track and via-to-pad checks while receiving an informational span-unavailable finding.

Copper-to-board inset and physical containment are separate observed conditions: tests cover threshold equality and one-unit offsets for tracks, vias, circular pads, axis-aligned rectangles, and 45-degree rectangles at all four board sides. The rotated-pad expectations independently calculate rotated AABB half-extents from trigonometric corner transforms; production transforms are not called by the expected-value calculation.

Same-net overlapping tracks are currently still checked by geometric clearance and reported as a violation. This is observed behavior only, not a claim that it is the desired product policy. With zero configured clearance, overlapping/tangent pad pairs and a via deeply inside a pad are currently clear under the present distance-only rule implementation. That zero-clearance overlap policy is not assumed to be intended and requires a product decision before any production change.

### Independent oracle and differential ledger

All expected DRC outcomes are derived in test-only arithmetic, not by calling production geometry or DRC functions. The test calls `validatePcb` only for the observed result. Integer fixtures use exact rational/BigInt predicates. Rotated rectangle cases independently transform corners and use bounded distance intervals with an explicit grid quantization error; threshold cases that the interval cannot resolve remain marked ambiguous. Metamorphic checks include translation, 90-degree rotation, reflection, uniform scaling, and endpoint reversal for equivalent track-pair geometry.

The 61-fixture ledger records **TP 37, TN 18, FP 0, FN 0, unresolved 6**. There are no false positives or false negatives among classifiable cases; unresolved results are not counted as passes. The six unresolved records are:

1. `track-via-equality`: exact oracle says equality is clear, production returns `PCB_GEOMETRY_INDETERMINATE`.
2. `pad-circle-circle-equality`: exact oracle says equality is clear, production returns indeterminate.
3. `pad-rect-rect-equality`: exact oracle says equality is clear, production returns indeterminate.
4. `phase538-track-pad-equality-90deg`: bounded rotated oracle and production are both indeterminate.
5. `phase538-track-pad-tangency-31deg`: bounded rotated oracle and production are both indeterminate.
6. `phase538-via-pad-equality-90deg`: bounded rotated oracle is indeterminate, while production returns clear.

Three additional exact local-frame certificates verify that the ideal 90-degree/31-degree track-pad equalities and 90-degree via-pad equality are mathematical equalities under orthogonal rotation. This narrows the attribution: for the rotated cases the remaining uncertainty is the bounded transformed-coordinate oracle/residual floating computation, not an undefined threshold convention. The via-pad rotated equality additionally exposes a production clear result where the oracle cannot certify the continuous transformed geometry; it is retained as a risk, not relabeled as a defect or pass. Follow-up work should reproduce these on a higher-precision exact/algebraic oracle or improve interval bounds before changing production.

### Boundary and applicability coverage

The independent fixture matrix includes positive-clearance overlap and copper tangency for all six pair families; equality, one tick below and above threshold; unequal track widths; circle and rectangle pad cases; different via copper diameters; zero-length and one-tick track segments; rotated diagonal track and via-to-rotated-rectangle cases; board-edge threshold and containment distinctions; and missing/invalid via-span input behavior. Cross-layer and explicit through-hole applicability are tested. Invalid single-layer span input is rejected by project validation and `validatePcb` returns the invalid-input finding.

### Confirmed defects and production changes

No new production defect was conclusively established in this phase, so no production code was modified. The prior rotated via-pad equality mismatch remains an unresolved boundary risk requiring higher-precision reference work. Current behavior treats all configured geometric minimum clearances uniformly even for same-net tracks; whether same-net exceptions should apply is undefined by the inspected schema/tests and is not changed here. Zero-clearance overlap is similarly a product-policy question, not changed without direction.

## Validation evidence

Commands run on the Phase 5.4 branch before report commit:

- `pnpm exec vitest run shared/phase5_4.drc-boundary-semantics.test.ts --reporter=verbose` — exit 0; 5/5 Phase 5.4 tests passed.
- `pnpm test` — exit 0; 10 test files, **114 tests passed** (including existing Phase 5.3 and Phase 5.3.8 suites).
- `pnpm check` — exit 0 (`tsc --noEmit`).
- `pnpm build` — exit 0. Vite emitted the existing warning that `/api/platform/config.js` cannot be bundled without `type="module"`; build completed.
- `git diff --check` — exit 0.
- Git status before commit: branch `verification/phase5-4-drc-boundary-semantics-20261120`; only the new Phase 5.4 test was untracked; baseline HEAD matched exactly.

Hosted GitHub Actions run: pending until final report-bearing commit is pushed. The existing Engineering workflow is configured for `verification/**` pushes and runs check, tests, and build; record exact run ID and URL below after completion.

## Known limitations and next steps

- No complete proof of geometric correctness is claimed. The exact oracle covers integer axis-aligned primitives; rotated rectangle cases use bounded numerical intervals, not symbolic algebra for arbitrary angles.
- Six boundary cases remain unresolved in the differential ledger; resolve with reproducible higher-precision evidence before changing outcomes.
- The schema only represents front/back copper layers, not a general multilayer stack or blind/buried via stackup. These topologies are untested/unrepresentable here.
- Via-via clearance is checked regardless of declared via spans in current production code; whether non-overlapping via spans should be excluded is an unresolved applicability policy.
- Same-net track exemptions and zero-clearance overlap/short semantics need explicit product decisions.
- Axis-aligned pad-pair exact cases do not cover every shape pairing (for example oval/rounded shapes) under this Phase 5.4 matrix.
- Final report-bearing SHA and hosted CI run evidence will be filled after the report commit and push.
