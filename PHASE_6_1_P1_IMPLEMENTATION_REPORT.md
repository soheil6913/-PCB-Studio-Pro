# PCB Studio Pro — Phase 6.1 P1 Implementation Report

## Status

**Implementation committed on an isolated branch; validation evidence is pending.**

- Repository: `soheil6913/-PCB-Studio-Pro`
- Base branch: `main`
- Exact base SHA: `a98384bbfc3296947b90f5254a03a77b11fdc8a9`
- Implementation branch: `fix/phase6-1-p1-explicit-v2-dispatch-20261122`
- No changes were made to `main`.
- No merge was performed.

## Implemented changes

### 1. Explicit legacy source-version dispatch

`runDesignRules` now resolves the source state using only `schemaVersion` after the complete project validator succeeds:

- `undefined` → explicit `versionless` compatibility case.
- `1` → explicit `schema-v1` compatibility case.
- `2` → explicit `schema-v2` compatibility case.
- Any unsupported or malformed state is rejected before evaluator dispatch.

All three accepted legacy cases route to the same unchanged V2 PCB geometry evaluator. This preserves the existing direct-DRC behavior for v1 and versionless projects without applying import migration during DRC. `CURRENT_PROJECT_VERSION` remains 2.

### 2. Guarded public PCB boundary

The former PCB evaluator body is now an internal V2 implementation. The exported `validatePcb` function is a guarded compatibility boundary that:

- accepts only recognized project-root fields;
- rejects unsupported or malformed explicit schema versions;
- leaves the existing nested Via validation in force;
- does not infer a model from ViaSpan, Stackup, process-evidence, ledger, graph, or other unknown metadata;
- retains the existing direct-helper invalid-input diagnostic.

The internal V2 geometry implementation, projected-2D all-Via-pairs formula, `diameter ?? drill * 2` fallback, comparator, pair iteration order, and finding identity construction were not intentionally changed.

### 3. Regression coverage added

The compatibility suite now includes:

- all existing Via geometry goldens through aggregate `runDesignRules`, not only `validatePcb`;
- separate versionless, v1, and v2 compatibility paths;
- malformed and unsupported versions: 0, negative, fractional, 3, 99, string, and null;
- direct-helper rejection for unsupported versions;
- root metadata rejection for ViaSpan, Stackup, processEvidence, ledger, and graph;
- nested ViaSpan-like field rejection;
- exact golden identity comparison for `id`, `ruleId`, `severity`, and ordered `objectIds`.

## Files changed

- `shared/engineering.ts`
- `shared/engineering.v2-compatibility.test.ts`

## Validation status and limitations

The test cases have been added but **have not yet been executed** in this environment. A local clone attempt could not resolve `github.com` because network DNS access is unavailable. No passing test, type-check, or build result is claimed in this report.

The next gate is to run at minimum:

- `pnpm exec vitest run shared/engineering.v2-compatibility.test.ts`
- `pnpm exec tsc --noEmit`
- preferably the full `pnpm test` suite.

Any compile/test failure must be corrected on this branch before the P1 implementation is considered verified. No P2 work is authorized by this report.

## Commit trail

- `81c50b4b65776cdc9d319b53e0933fa3f0c3424e` — guarded boundary and initial dispatch.
- `f3ed3c12e6555fca825d3a088d4f3caa8ce69b4f` — dispatch and boundary regression tests.
- `06ed36da7936670d713cd497b2283eec343f84ae` — exhaustive fail-closed dispatch.

The implementation branch is isolated from `main`. No merge was performed.
