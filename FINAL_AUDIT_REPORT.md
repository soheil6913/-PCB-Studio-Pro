# Final pre-merge audit report

Branch: `fix/followup-pad-geometry-json-tolerance-20261119`

Base commit: `b7845f7c61a3db8d8eec617d7a4ab4016837c1cc`

## Corrections

### Via containment and boundary semantics

`pointToEllipseBoundaryDistance()` now returns `0` when the Via center is exactly at the Pad center. A Via center strictly inside an ellipse or circle also returns `0` through the normalized-inside check. `viaToPadDistance()` then subtracts the Via radius and clamps at zero.

The new regression test covers six independent cases, and asserts both the numeric distance and DRC result:

1. Via centered exactly on a circular Pad: distance `0`, DRC violation for positive required clearance.
2. Via centered exactly on an oval Pad: distance `0`, DRC violation for positive required clearance.
3. Via fully inside a circle but off-center: distance `0`, DRC violation for positive required clearance.
4. Via tangent to the circle boundary: distance `0`, DRC violation for positive required clearance.
5. Via outside the circle: distance `2`, no finding at `1.99`, finding at `2.01`.
6. Via larger than the Pad: distance `0`, DRC violation for positive required clearance.

### GitHub Actions pnpm version

`package.json` declares:

```text
pnpm@10.18.0
```

The workflow now installs exactly:

```yaml
uses: pnpm/action-setup@v4
with:
  version: 10.18.0
```

The local check confirmed both values match. The workflow continues to use `pnpm install --frozen-lockfile`.

## Actual local results

```text
pnpm exec vitest run shared/engineering.test.ts
1 test file passed
23 tests passed

pnpm check
passed

pnpm test
3 test files passed
29 tests passed

pnpm build
passed
```

The build still prints the existing Vite warning for `/api/platform/config.js` missing `type="module"`; it does not fail the build and is unrelated to DRC geometry.

## GitHub Actions

The pushed commit creates a new run from `.github/workflows/engineering.yml`, which executes check, test, and build with pnpm 10.18.0. The run URL will be reported after GitHub completes it.

`main` was not modified and no merge was performed.
