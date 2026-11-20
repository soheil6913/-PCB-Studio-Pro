# PCB Studio Pro — Phase 5.5 DRC Policy Certification

## Executive status

Phase 5.5 is a policy-resolution and independent-verification phase on an isolated branch. No production code was changed. The repository contains no authoritative product-owner policy resolving zero-clearance copper overlap or via-to-via layer applicability, so those choices are explicitly **PENDING PRODUCT-OWNER DECISION**; this report separates those pending normative choices from observed implementation behavior.

No universal or complete DRC correctness claim is made. The Phase 5.4 and Phase 5.3.8 unresolved boundary findings are preserved. Their fixture-specific inputs, oracle methods, observed outputs, dispositions, and remaining uncertainty are listed below.

## Isolation and provenance

- Repository: `soheil6913/-PCB-Studio-Pro`
- Branch: `verification/phase5-5-drc-policy-certification-20261120`
- Required baseline / initial SHA: `defae765596b349ebb2f649e1b110f976e0e44ad`
- Baseline verified before branch creation; new branch was created directly at this exact commit.
- Local `main` at preflight: `de7497a675af7c6212bbc4751fce098c1f414e8d`; no `main` ref or worktree changes were made.
- No merge, rebase, cherry-pick, PR, or history rewrite was performed.
- Final SHA: to be filled with the report-bearing commit after validation and push; this report cannot contain its own commit SHA.
- Production implementation file `shared/engineering.ts` is unchanged.

## Files changed

- `shared/phase5_5.drc-policy-certification.test.ts` — new policy-observation and boundary certification tests.
- `PHASE_5_5_DRC_POLICY_CERTIFICATION.md` — this report.
- All earlier phase tests, reports, and commits remain intact. Existing test assertions were not skipped, deleted, weakened, or relabeled.

## Formal policy decision table

“Observed” is the implementation behavior at the pinned baseline. “Proposed mathematical policy” is the ordinary geometric interpretation, not a product-owner authorization to change behavior.

| Topic / case | Mathematical or engineering distinction | Behavior observed at baseline | Phase 5.5 status / decision |
|---|---|---|---|
| Clearance below positive threshold | Physical copper sets may be disjoint yet have a gap below the required spacing; this is a clearance violation, distinct from a physical short/overlap. | Relevant pair checks emit pair-specific clearance errors when the numerical comparison resolves below threshold; shortfalls within the 16-epsilon band can be `PCB_GEOMETRY_INDETERMINATE`. | Confirmed behavior; keep fail-closed indeterminate. |
| Clearance exactly equal to threshold | Exact mathematical equality meets a minimum-distance inequality `actual >= required`. | Comparison is clear when binary64 arithmetic resolves `actual >= required`; a small computed shortfall inside the uncertainty band is indeterminate. | Mathematical contract: equality is CLEAR. Floating implementation contract: do not coerce indeterminate to clear or violation. |
| Clearance above threshold | Copper is separated by more than the minimum required distance. | Clear when computation resolves. | Confirmed semantic target; tested below/equal/above for fixed-grid track pairs. |
| Numerically indeterminate clearance | The computed interval/shortfall cannot establish either side reliably. | Emits Error-level `PCB_GEOMETRY_INDETERMINATE` in affected paths. | Preserve INDETERMINATE. Product-owner decision is not required to preserve numerical uncertainty. |
| Zero rule; track-track copper overlap / containment / identical track centerline geometry | A zero clearance does not remove track copper radius: required centerline spacing still includes both half-widths. Overlapping copper is not mere clearance shortfall. | Same-layer overlap/containment/identical centerlines violate; opposite layers are not compared. Track net IDs do not exempt the check. | Observed; whether same-net overlap should be exempt or intentional remains **PENDING PRODUCT-OWNER DECISION**. |
| Zero rule; track-via and track-pad overlap / containment / identical centerline/copper | Track half-width and via/pad copper extent remain part of the distance threshold even when configured clearance is zero. | Tested overlap and containment violate for applicable same-layer geometry; non-applicable layers are excluded by existing gates. | Observed geometric behavior. Same-net copper merge policy and whether such overlaps are legal remain **PENDING PRODUCT-OWNER DECISION**. |
| Zero rule; via-via overlap / containment / identical centers | Via copper radii are included in the required center distance even when configured clearance is zero. | Tested overlapping, contained, and identical via copper violates. Current check does not gate on via spans. | Observed. Intended no-shared-layer handling is **PENDING PRODUCT-OWNER DECISION** (and not representable for valid distinct spans in this two-layer model). |
| Zero rule; via-pad overlap / containment / identical geometry | A nonnegative distance between filled copper sets compared against zero is always at least zero; “no clearance violation” does not establish that the copper overlap is a valid fabrication/electrical merge. | Partial overlap, containment, and identical via/pad locations are clear under the current distance-only `viaToPadDistance` rule at zero clearance, for applicable layers. | Observed, not endorsed. Whether zero-clearance overlap/short is permitted is **PENDING PRODUCT-OWNER DECISION**. |
| Zero rule; pad-pad overlap / containment / identical geometry | The filled-shape gap is clamped to a nonnegative value; `distance >= 0` alone cannot detect a short. Clearance and copper topology are separate concepts. | Partial overlap, containment, and identical circle geometry are clear under the current pad distance rule at zero clearance, for pads sharing an applicable layer. | Observed, not endorsed. Whether touching/overlapping distinct pad objects is permitted is **PENDING PRODUCT-OWNER DECISION**. |
| Zero rule; exact copper tangency | Tangent copper has physical gap zero; if only a zero minimum spacing is configured, it meets the numerical distance inequality, but may still be subject to short/net/connectivity policy. | The tested track-track, track-via, track-pad, via-via, pad-pad, and via-pad tangencies are CLEAR when their geometric distance exactly meets the zero-clearance threshold. Overlaps can still be violations for track-width/via-diameter pair rules, but are CLEAR under the current zero-threshold distance-only pad-pad/via-pad rules. | Equality is mathematically inclusive; object overlap/short semantics remain distinct and uniform product policy is **PENDING PRODUCT-OWNER DECISION**. No production changes. |
| Via spans identical / reversed | Only layer endpoints `F.Cu` and `B.Cu` exist; order reversal does not change the represented pair. | Both valid orders are accepted; via-via checks apply. | Confirmed for the current schema. |
| Via spans partially overlapping / adjacent non-overlapping | These require a multilayer stack with at least one internal copper layer and a layer ordering. | `Layer` is only `"F.Cu" | "B.Cu"`; valid span arrays must contain exactly those two distinct layers. No internal-layer ordering exists. | **PENDING PRODUCT-OWNER DECISION** for any future multilayer model; these cases are unrepresentable and not inferred. |
| Through-hole / blind / buried via distinctions | Physical via construction and conductive layer extent affect which copper layers participate, and may separately implicate drill, annular-ring, aspect-ratio or fabrication constraints. | A valid two-endpoint `F.Cu`/`B.Cu` span is representable; no via kind or stackup property distinguishes through-hole from blind/buried. Drill and annular ring are checked separately. | Through-hole label is not explicit; blind/buried distinctions are unrepresentable. Future semantics **PENDING PRODUCT-OWNER DECISION**. Manufacturing rules beyond represented drill/annular checks are out of scope. |
| Missing via span | Unknown span is not equivalent to “no shared layer.” | Missing span emits informational `PCB_VIA_LAYER_SPAN_UNAVAILABLE`; track-via and via-pad checks requiring span are skipped. Via-via clearance currently still runs without consulting spans. | Observed. Whether unknown span should suppress via-via copper clearance or produce an error/warning is **PENDING PRODUCT-OWNER DECISION**. |
| Malformed/unknown span | Invalid metadata cannot safely establish applicability. | Single layer, duplicate layers, or unknown layer strings fail project validation; `validatePcb` returns `PCB_INVALID_INPUT`. | Confirmed fail-closed validation for representable invalid values. |
| Two vias with no shared conductive layer | If verified conductive spans do not overlap, copper-to-copper spacing between those via barrels/pads may be inapplicable; other manufacturing constraints can still apply. | The present schema cannot encode two valid disjoint spans, and the implementation checks every via pair regardless of spans. | Whether to exclude copper clearance for verified no-shared-layer pairs is **PENDING PRODUCT-OWNER DECISION**. Do not generalize to drill/fabrication rules. |

### Interpretation of zero clearance

A configured clearance of zero is a minimum-spacing rule value; it is not itself an explicit authorization to merge different copper objects. Physical overlap, exact tangency, and clearance failure are distinct predicates. At baseline, track-containing rules include track widths and via diameters in their distance threshold, while the pad-pad and via-pad functions compute nonnegative gap distance and compare it to the configured rule. Consequently, zero-clearance behavior is not uniform across object pairs. Product-level short, same-net merge, and connectivity policies are not specified in the repository; all normative decisions about whether separate copper objects may overlap/touch remain **PENDING PRODUCT-OWNER DECISION**.

## Six Phase 5.4 ledger fixture dispositions

The original 61-fixture ledger remains unchanged at **TP 37, TN 18, FP 0, FN 0, unresolved 6**. No unresolved record is counted as passing. Fixture inputs/results below are source-derived; the independent workflow reviewed the code and report read-only. The individual production observations are asserted in the Phase 5.4 test ledger; the reviewers did not run a new standalone production executable for each case.

| Fixture ID | Exact input / independent evidence | Recorded production result | Phase 5.5 disposition |
|---|---|---|---|
| `track-via-equality` | Track `(-5,0)→(5,0)`, width 0.2; via at `(0,0.6)`, diameter 0.6; track-to-via clearance 0.2. Exact tick/BigInt squared comparison ties exactly (1,440,000 on both sides); exact oracle says CLEAR. | `PCB_GEOMETRY_INDETERMINATE` (ledger `AMBIGUOUS`). | **Genuinely indeterminate for implemented binary64 comparison**. Ideal tick geometry is equality; no product contract found requiring near-tie to override conservative numerical policy. No confirmed defect. |
| `pad-circle-circle-equality` | Circle diameters 0.6 and 1.0 at centers `(0,0)` and `(1,0)`; clearance 0.2. Exact squared tick comparison ties at 4,000,000; exact oracle says CLEAR. | `PCB_GEOMETRY_INDETERMINATE` (ledger `AMBIGUOUS`). | **Genuinely indeterminate**. Exact ideal geometry proves equality, but source does not capture a higher-precision production distance trace or policy mandate to resolve every binary64 near-tie as CLEAR. No confirmed defect. |
| `pad-rect-rect-equality` | Axis-aligned 1.0×0.6 and 0.6×0.6 pads at x=0 and x=1; clearance 0.2. Exact gap is 0.2; doubled-coordinate squared values both equal 160,000; oracle says CLEAR. | `PCB_GEOMETRY_INDETERMINATE` (ledger `AMBIGUOUS`). | **Genuinely indeterminate**. Exact geometry is equality; conservative numerical implementation is documented. No confirmed defect or policy authorization to force CLEAR. |
| `phase538-track-pad-equality-90deg` | Pad 6×4, 90°; F.Cu track width 0.2 at local y=2.4; clearance 0.3. Independent local-frame BigInt certificate proves ideal gap 0.4 equals threshold 0.4; rotated-coordinate fixed-grid interval remains ambiguous. | `PCB_GEOMETRY_INDETERMINATE` (ledger `AMBIGUOUS`). | **Oracle limitation / unresolved concrete transformed input**. Exact local frame confirms intended equality, not exact arithmetic of the trigonometric binary64 world coordinates. Do not count as passing. |
| `phase538-track-pad-tangency-31deg` | Pad 6×4, 31°; track is rotated local segment `(-8,2.4)→(8,2.4)`, width 0.2; clearance 0.3. Exact local-frame ideal distance equals 0.4 threshold; independent transformed interval remains ambiguous. | `PCB_GEOMETRY_INDETERMINATE` (ledger `AMBIGUOUS`). | **Oracle limitation / unresolved**. Need an outward-rounded/algebraic certificate for represented coordinates. No production defect. |
| `phase538-via-pad-equality-90deg` | Pad 6×4 at `(20,30)`, 90°; via local `(0,2.5)`, world `(17.5,30)`, diameter 0.4; clearance 0.3. Exact local-frame rectangle gap is 0.5, equal to radius 0.2 + clearance 0.3. Bounded transformed oracle is ambiguous. | Clear (ledger actual `CLEAR`). | **Oracle limitation; intended equality independently supported**. Original oracle remains ambiguous and must not be relabeled as passing. Independent local rational geometry supports the production observation for the ideal 90° construction; no universal transformed-input proof is claimed. |

## Three Phase 5.3.8 prior unresolved fixture dispositions

Phase 5.3.8’s own 28-record ledger remains **TP 17, TN 8, FP 0, FN 0, unresolved 3**. Those three entries overlap geometrically with Phase 5.4 reproductions but remain separately reported as historical records; counts must not be added as if they were independent unique physical fixtures.

| Requested description | Source fixture and evidence | Recorded production / oracle | Disposition |
|---|---|---|---|
| Track tangency | Literal requested ID was not present. Source-matched case is `track-rotated-tangency-uncertainty-31deg` in `shared/phase5_3_8.rotated-rectangle.test.ts`, reproduced as `phase538-track-pad-tangency-31deg` in Phase 5.4. Pad 6×4 rotated 31°; track width 0.2 on local y=2.4; clearance 0.3. Source geometry establishes ideal equality. | Phase 5.3.8 interval/production both AMBIGUOUS; Phase 5.4 reproduction likewise. | **Oracle limitation** for transformed geometry; keep unresolved. The supplied request’s label is not literal source ID, and match is based on parameters/source, not assumed alias. |
| 31-degree track case | Literal requested ID was not present. Matching source case is `track-rotated-tangency-uncertainty-31deg`; Phase 5.4 source independently repeats the same angle, dimensions, endpoints and threshold. No distinct second 31° track boundary case with different geometry was found in the referenced unresolved set. | Interval and production AMBIGUOUS in the matching case. | **Oracle limitation**. Same underlying parameter set as the tangency description above; this is not an independent additional passing fixture. Avoid double-counting. |
| Via equality | Source fixture is `via-exact-clearance-equality-90deg`, reproduced as `phase538-via-pad-equality-90deg`. Rectangle 6×4, 90°; via diameter 0.4 at local `(0,2.5)`; clearance 0.3. Exact orthogonal local-frame calculation gives gap 0.5 and threshold 0.5. | Phase 5.3.8 fixed-grid interval AMBIGUOUS, production CLEAR; Phase 5.4 likewise. | **Oracle limitation** in the transformed fixed-grid method; ideal geometry and production CLEAR agree. Preserve original AMBIGUOUS ledger entry; it is not reclassified as passed. |

The three Phase 5.3.8 descriptions are the historical unresolved set; their source labels do not imply three new fixtures in addition to the matching Phase 5.4 records. The 31°/tangency descriptions refer to the same source construction as far as the inspected test code establishes. If product owners intended different fixture identities, those inputs were not supplied and remain untested.

## Board-edge coverage matrix

The Phase 5.4 suite had all-four-side rotated-rectangle near-edge checks, but its track, via, circle, and axis-aligned rectangle threshold fixture loops exercised only the left side. Phase 5.5 adds explicit per-side cases for every requested primitive type.

| Primitive | Left | Right | Top | Bottom | Each side positions | Finding separated from containment |
|---|---:|---:|---:|---:|---|---|
| Track | covered | covered | covered | covered | one clearance-unit inset equality; 0.01 outside and inside | yes; additionally a physical copper protrusion test at zero inset |
| Via | covered | covered | covered | covered | inset equality; 0.01 outside and inside | yes; via extent is tested against board inset; physical protrusion distinction is demonstrated separately for track |
| Circular pad | covered | covered | covered | covered | inset equality; 0.01 outside and inside | yes for pad inset rule; separate track case demonstrates physical protrusion vs inset |
| Rotated rectangular pad (45°) | covered | covered | covered | covered | independently transformed corners/AABB, equality; 0.01 outside and inside | yes for pad inset rule; separate track case demonstrates physical protrusion vs inset |

Phase 5.5 creates **48 edge cases** (4 primitive types × 4 sides × 3 positions), plus one physical-protrusion case. All edge locations are independently constructed; rotated pad bounds derive from separately transformed corners, not production helpers. The test calls only `validatePcb` for observed outcomes. Board-edge tangency/equality means equality to the configured copper inset, not a claim about zero-clearance inter-object overlap.

## Independent oracle methodology and integrity

- The Phase 5.4 oracle helpers in `shared/phase5_4.drc-boundary-semantics.test.ts` are test-only and use BigInt doubled coordinates for exact rational distance comparisons on fixed-grid primitive pairs. Expected values do not call production geometry or DRC routines.
- `shared/phase5_3.independent-oracle.ts` computes segment/polygon and point/polygon distances through independent integer predicates. Rotated corners are transformed independently, quantized to the declared fixed grid, then exact BigInt distances are widened by an explicit quantization and binary64 error envelope. A threshold overlap of the interval returns AMBIGUOUS.
- Local-frame certificates for the 90° and 31° track ties and 90° via tie use integer/rational axis-aligned geometry and the orthogonal invariance of ideal geometry. They establish the intended mathematical input, not an exact proof of every rounded trig-generated binary64 coordinate or production intermediate.
- Phase 5.5’s edge oracle constructs rotated rectangle corners directly from sine/cosine formulas and checks locations relative to independently computed extrema. It does not call `padAxisAlignedHalfExtents` or any production transform helper.
- Phase 5.5 fixed-grid track-pair equality cases use exact BigInt segment-distance squared predicates for the independent expected result; metamorphic cases are translation, 90° rotation, reflection, uniform scale with threshold scaled consistently, endpoint reversal, and identity.
- Production validator is called only to observe actual results. In the nine-fixture review, reviewers used existing source assertions and report entries; they did not independently re-run each Phase 5.4 fixture one by one. No fixture was promoted from unresolved based solely on another test’s result.

## Test matrix and classification counts

### Existing differential ledgers (unchanged)

| Ledger | Fixtures | TP | TN | FP | FN | Unresolved |
|---|---:|---:|---:|---:|---:|---:|
| Phase 5.4 cross-primitive differential ledger | 61 | 37 | 18 | 0 | 0 | 6 |
| Phase 5.3.8 rotated-rectangle ledger | 28 | 17 | 8 | 0 | 0 | 3 |

Do not sum these ledgers as disjoint observations: the older three boundary constructions are reproduced among the Phase 5.4 unresolved cases. The per-ledger unresolved records above remain unresolved even where later local-frame certificates strengthen the ideal mathematical analysis.

### Added Phase 5.5 explicit scenario matrix

| Area | Explicit inputs / cases | Expected/observed assertion |
|---|---:|---|
| Zero-clearance relations, 6 primitive pairs × positive gap/tangency/partial overlap/containment/identical | 30 | Observed behavior assertions only; no normative policy inferred |
| Via-span schema/applicability | 7 scenarios (2 valid ordered spans, missing span, 4 malformed/unknown examples) | Current F/B representation and invalid-input behavior |
| Fixed-grid track-pair threshold | 3 (below/equal/above) | Exact BigInt expected classification vs `validatePcb` |
| Board edges | 48 (track, via, circle, rotated rect × 4 sides × outside/equal/inside) + 1 physical protrusion | Edge-clearance outcomes and separate containment evidence |
| Metamorphic track pairs | 6 (identity, translation, rotation, reflection, scale, reversal) | Invariance of exact violation classification |

The Phase 5.5 test file contains **5 Vitest tests**. Scenario counts are not additional Vitest test counts and do not change the two prior ledger totals. The six Phase 5.4 unresolved cases and three source-matched historical records are also reviewed/documented, not silently classified as passing.

## Confirmed defects, production changes, and pending decisions

- **Confirmed new production defects:** none established.
- **Production fixes:** none. `shared/engineering.ts` remains unchanged; evidence does not meet all five required criteria for a production fix.
- **Zero-clearance overlap/touch policy:** **PENDING PRODUCT-OWNER DECISION** for whether separate copper objects at different net identities may overlap/touch; how same-net overlaps should be treated; and whether physical shorts need separate DRC checks beyond clearance inequalities.
- **Via-via applicability across layer spans:** **PENDING PRODUCT-OWNER DECISION** on whether a verified lack of shared conductive copper layers should suppress copper clearance and how unknown spans should behave. The current project model cannot encode multilayer partial/disjoint spans.
- **Via construction policy:** **PENDING PRODUCT-OWNER DECISION** before introducing through-hole/blind/buried distinction or stackup order; current data model has no via-kind field or internal layers.
- **Equality:** mathematical minimum-distance equality is CLEAR; numeric uncertainty remains INDETERMINATE. No change to the conservative implementation without stronger evidence and an explicit product requirement.

## Validation evidence

Baseline test run before edits: `pnpm test` — exit 0, **114 tests passed across 10 files**.

After adding the Phase 5.5 test file:

| Exact command | Result |
|---|---|
| `pnpm exec vitest run shared/phase5_5.drc-policy-certification.test.ts --reporter=verbose` | Exit 0; 1 file, 5 tests passed |
| `pnpm test` | Exit 0; 11 files, **119 tests passed** (114 inherited tests remain passing; 5 new tests) |
| `pnpm check` | Exit 0 (`tsc --noEmit`) |
| `pnpm build` | Exit 0. Existing Vite warning: `/api/platform/config.js` cannot be bundled without `type="module"`; build completed. |
| `git diff --check` | Exit 0 before report addition; must be rerun on final diff/commit. |
| Git status before report finalization | On Phase 5.5 branch; only new Phase 5.5 test untracked at the time of check; production file unchanged. |

GitHub Actions on the final report-bearing commit: **PENDING**. The isolated Phase 5.5 branch must be pushed and its Engineering verification run awaited; record exact run ID, URL, result, final SHA, and final status after the run completes. No CI success is claimed yet.

## Technical limitations and untested combinations

- No complete geometric correctness proof is claimed.
- IEEE-754 production coordinates and fixed-grid oracle transformations are different numeric models; a local ideal equality certificate does not automatically certify the exact rounded world-coordinate input.
- Six Phase 5.4 cases and three Phase 5.3.8 historical entries remain marked unresolved in their original ledgers. Some have stronger mathematical interpretation, but no record is reclassified.
- Two requested legacy description IDs are not literal source IDs; source matches are cautious and stated explicitly. Alternate intended inputs for those descriptions were not available.
- The layer model only represents `F.Cu`/`B.Cu`; arbitrary stackup layers, partial overlap, non-overlap adjacency, and via types are not expressible.
- The current via-via production loop ignores `via.layers`; that observed behavior is not endorsed as intended policy.
- Existing zero-clearance test cases do not establish product intent for electrical nets, intentional same-net copper joins, thermals, slots, drilled pads, or manufacturing constraints.
- Edge tests exercise rectangular board bounds, not arbitrary board outlines/cutouts.
- Pad zero-clearance additions use circle geometry for the systematic five-relation matrix; the prior Phase 5.4 rotated and axis-aligned rectangular coverage remains preserved, but every shape/pairing is not exhaustively crossed with every zero-clearance relation.
- Via manufacturing rules beyond represented minimum drill and annular ring are outside this phase.

## Recommended next steps

1. Obtain explicit product-owner rulings for the four pending areas above before changing DRC outcomes.
2. If multilayer support is intended, first define the stackup/order and valid via construction data model; only then specify interval intersection and no-shared-layer applicability.
3. For the five indeterminate equality cases, add exact rational predicates for truly fixed-grid coordinates and a verified outward-rounded/algebraic treatment of trig-derived inputs; retain ambiguity until the concrete numerical side is certified.
4. Keep the 90° via-pad case as an original interval-oracle unresolved record until the bounded oracle can certify the represented transformed input; local-frame analysis alone is not universal proof.
5. Run and record final hosted CI after the report-bearing commit. Do not merge or modify `main`.
