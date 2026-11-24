# PCB Studio Pro — Phase 6.1 P2.2
## Circle / Oval Geometry Contract Implementation & Adversarial Verification

**Status:** COMPLETE  
**Repository:** `soheil6913/-PCB-Studio-Pro`  
**Implementation branch:** `fix/phase6-1-p2-2-circle-oval-contract-20261123`  
**Implementation commit:** `108c0667885f33debe33b70df9f18a902cf3dc7f`  
**CI run:** [Engineering verification — run 45171258099](https://github.com/soheil6913/-PCB-Studio-Pro/actions/runs/45171258099)  
**CI conclusion:** success

## 1. Verified baseline and protected references

Before implementation, the actual GitHub remote was independently fetched and checked:

| Reference | Verified SHA / status |
|---|---|
| `main` | `a98384bbfc3296947b90f5254a03a77b11fdc8a9` |
| P2.1 branch `audit/phase6-1-p2-independent-20261123` | `e6b2a9153beec74c6d2013c6eda5362e850806b0` |
| P2.1 commit | `e6b2a9153beec74c6d2013c6eda5362e850806b0` |
| P1 branch / PR #3 head | `f2db0afbdcdea6909e7ee91a8f340862741c6db0` |
| PR #3 | Open and Draft; base `main`; not modified or merged |
| Temporary verification branch | remained at `e6b2a9153beec74c6d2013c6eda5362e850806b0` |

The implementation branch was created directly from the verified P2.1 commit. No merge, rebase, amend, force-push, tag, release, deployment, or PR creation was performed.

## 2. Approved binding contract

The product decision supplied for this task is implemented as binding:

- `shape: "circle"` represents a true circle with one diameter.
- Circle `width` and `height` must both be positive finite numbers and must be exactly equal under the existing JavaScript numeric equality policy.
- `shape: "oval"` represents an ellipse and supports independent positive finite `width` and `height` values.
- Equal Oval dimensions remain valid.
- Unequal Circle dimensions are invalid and are not normalized or converted to Oval.

## 3. Source inventory and affected paths

The repository-wide inspection covered:

- `Pad`, `FootprintGeometry`, component and project definitions in `shared/engineering.ts:1-13`;
- Pad validation and nested footprint validation in `shared/engineering.ts:411-435`;
- Circle/Oval support extents and GJK support in `shared/engineering.ts:101-118`;
- Circle, Oval, mixed-shape, point, segment, and Pad-to-Pad distance paths in `shared/engineering.ts:225-266`;
- aggregate DRC dispatch and fail-safe validation in `shared/engineering.ts:303-409`;
- JSON migration in `shared/engineering.ts:435`;
- local storage, JSON import/export, and UI validation in `client/src/pages/Home.tsx:89-100`;
- existing Circle/Oval fixtures across `shared/engineering.test.ts`, `shared/phase4.gjk.test.ts`, `shared/phase5_1.geometry-validation.test.ts`, `shared/phase5_3.independent-oracles.test.ts`, `shared/phase5_4.drc-boundary-semantics.test.ts`, and `shared/phase5_5.drc-policy-certification.test.ts`.

No UI path creates or edits Pad geometry. The current UI edits components, not individual Pads. No manufacturing, KiCad, or Gerber export path consumes Pads. The 3D view remains a placeholder.

## 4. Exact implementation changes

### 4.1 Validation

**File:** `shared/engineering.ts`  
**Changed function:** `validatePad`, currently line 415

Added one shape-dependent validation branch after the existing positive/finite checks:

```ts
if (
  pad.shape === "circle" &&
  finite(pad.width) && pad.width > 0 &&
  finite(pad.height) && pad.height > 0 &&
  pad.width !== pad.height
) {
  errors.push({
    path: `${path}.height`,
    message: "Circle pads require equal width and height; Oval pads support independent dimensions",
  });
}
```

The condition intentionally runs only after both dimensions are valid, so malformed zero, negative, `NaN`, or infinite fields continue to receive the existing field-specific diagnostic rather than an additional misleading equality error.

The diagnostic is deterministic, identifies the affected Pad through its complete nested path, and states both sides of the approved contract. No dimension is replaced with another value.

### 4.2 Geometry

No production geometry algorithm was changed. The pre-existing implementation already matches the approved contract:

- Circle support geometry uses one radius derived from `width` in `shared/engineering.ts:108-110` and `117`.
- Circle/Circle and mixed Circle paths use the Circle diameter from `width` in `shared/engineering.ts:258`.
- Circle point-to-boundary and segment-to-Pad paths use the same width-derived radius in `shared/engineering.ts:262-266`.
- Oval support, point-to-boundary, segment-to-boundary, common-axis analytic distance, and GJK paths use independent `width` and `height` values.

The new validation boundary prevents an invalid unequal Circle from reaching these width-driven consumers through normal project validation. No Circle was reinterpreted as Oval, and no Oval dimension was substituted or normalized.

### 4.3 DRC

`runDesignRules` and the V2 evaluator were not changed. Malformed unequal Circle project input now fails at the existing project validation boundary and returns the established aggregate `PROJECT_INVALID` Error finding. Existing DRC finding IDs, order, severity policy, geometry algorithms, and fail-safe behavior remain unchanged for valid projects and unrelated malformed inputs.

### 4.4 Migration and serialization

`migrateProjectJson` was not changed. It continues to preserve explicit fields and does not silently normalize or convert shape/dimension data. Because migration calls `validateProjectJsonDetailed` on the migrated object, an unequal Circle remains rejected after migration. Valid Circle and unequal Oval values retain their exact shape and dimensions through JSON serialization, deserialization, and migration tests.

This implementation does not claim that no external user file contains unequal Circle data. Repository inspection found no committed persisted or legacy fixture containing unequal Circle dimensions; external files remain unknown. Such files now receive a deterministic validation failure rather than silent data loss or transformation.

## 5. New tests and coverage

**New file:** `shared/phase6-1-p2-2.circle-oval-contract.test.ts`

The focused file contains **21 passing tests** covering:

1. Equal positive finite Circle acceptance.
2. Circle width smaller than height rejection.
3. Circle width greater than height rejection.
4. Zero width rejection.
5. Zero height rejection.
6. Negative width rejection.
7. Negative height rejection.
8. `NaN` width rejection.
9. Infinite height rejection.
10. Stable, deterministic Pad-specific equality diagnostic.
11. Missing and malformed Circle dimensions through existing validation policy.
12. Unequal positive Oval acceptance.
13. Equal positive Oval acceptance.
14. Independently invalid Oval width/height rejection.
15. Circle single-diameter and Oval independent-dimension point geometry.
16. Segment-to-Oval and Pad-to-Pad DRC shape semantics.
17. Fail-safe DRC handling for malformed unequal Circle input.
18. Valid Circle round-trip preservation.
19. Valid unequal Oval round-trip preservation.
20. Invalid Circle rejection after JSON serialization/deserialization.
21. Invalid Circle rejection through migration.

Existing GJK, rotated geometry, DRC boundary, numerical stability, layer applicability, and legacy compatibility suites were preserved and executed in full.

## 6. Verification results

### Local verification on implementation commit `108c0667885f33debe33b70df9f18a902cf3dc7f`

| Command | Result |
|---|---|
| `pnpm vitest run shared/phase6-1-p2-2.circle-oval-contract.test.ts` | PASS — 1 file, 21 tests |
| `pnpm check` | PASS |
| `pnpm test` | PASS — 14 files, 190 tests |
| `pnpm build` | PASS — Vite client and esbuild server bundle completed |
| `git diff --check` | PASS |

The production build emitted the repository’s existing Vite warning that `/api/platform/config.js` cannot be bundled without `type="module"`; the build completed successfully and no warning was introduced by this change.

### GitHub Actions verification

Run: [45171258099](https://github.com/soheil6913/-PCB-Studio-Pro/actions/runs/45171258099)  
Workflow: `Engineering verification`  
Event: `push`  
Branch: `fix/phase6-1-p2-2-circle-oval-contract-20261123`  
Checked-out SHA: `108c0667885f33debe33b70df9f18a902cf3dc7f`  
Conclusion: **success**

Job `verify` and all relevant steps passed:

- Checkout — success
- Setup pnpm — success
- Setup Node.js — success
- Install dependencies — success
- TypeScript check — success
- Automated tests — success
- Production build — success

## 7. Adversarial self-review

The following checks were performed after implementation:

- No remaining Circle consumer was found that treats Circle height as an independent radius. Existing Circle consumers consistently use width as the diameter source.
- Oval consumers use both width and height; no changed code substitutes width for Oval height.
- Migration, import, deserialization, and local-storage paths do not silently change shape or dimensions.
- Invalid unequal Circle data cannot pass normal project validation, DRC validation, or migration validation.
- Direct geometry functions retain their established behavior and are protected at the project validation boundary; no unrelated geometry refactor was introduced.
- Existing DRC IDs, finding ordering, and aggregate fail-safe behavior are unchanged.
- The new tests use independently calculated numeric expectations rather than merely mirroring implementation expressions.
- The diff relative to P2.1 contains one production validation condition and one focused test file; no UI, workflow, package, dependency, or unrelated DRC changes were found.

## 8. Compatibility and known limitations

- Existing repository fixtures use equal Circle dimensions and remain compatible.
- Oval dimensions remain independent and existing unequal Oval fixtures remain valid.
- External legacy files with unequal Circle dimensions are not silently repaired. They will fail validation with the stable diagnostic. A future product decision may define an explicit user-facing repair or migration workflow, but none was added here.
- The UI still has no Pad editor or visual Pad rendering path.
- KiCad/Gerber export is not implemented.
- The 3D view remains a placeholder.
- No IPC, manufacturing, thermal, impedance, or external-footprint-library sign-off is claimed.

## 9. Protected-reference confirmation

- `main` was not modified.
- P1 branch and PR #3 were not modified, closed, merged, retargeted, or recreated.
- P2.1 branch was not modified.
- Temporary verification branches were not deleted or modified.
- No release, tag, production deployment, or new PR was created.

## 10. Files changed by the implementation commit

1. `shared/engineering.ts` — explicit Circle equality validation.
2. `shared/phase6-1-p2-2.circle-oval-contract.test.ts` — focused contract and adversarial tests.

This report is the required documentation deliverable. The previous design-only report `PHASE_6_1_P2_2_CIRCLE_PAD_CONTRACT_INVESTIGATION.md` was preserved as an existing untracked local file and was not modified or deleted.
