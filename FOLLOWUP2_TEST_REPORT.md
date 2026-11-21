# Follow-up 2 verification report

Branch: `fix/followup-pad-geometry-json-tolerance-20261119`

Base reviewed commit: `60bc18e07ac2263f3a66f8256af2a79b559721b2`

## Implemented corrections

### Exact Via-to-Pad clearance

The previous Via-to-Pad calculation used center distance plus `Math.max(width, height) / 2`. It now uses the actual Pad shape and the Via circle:

- `rect`: point-to-boundary distance for an oriented rectangle
- `oval`: point-to-boundary distance for a rotated ellipse using a converged Lagrange-multiplier solve
- `circle`: center distance minus both radii
- Via radius: `diameter / 2`, with the existing `drill * 2` fallback
- Pad rotation: component rotation and independent Pad rotation are composed by `localPads`

The exported `viaToPadDistance()` is used by `validatePcb()` and by numeric regression tests. DRC compares the measured boundary clearance directly with `designRules.viaToPadClearance`.

### Strict JSON schema validation

Unknown keys are now rejected at the root and nested levels. Type and value validation covers:

- project metadata, schema version, revision, grid, active layer
- component IDs and fields, pins, footprint geometry, pads, courtyard
- wire IDs, endpoints, net, junction flag
- track IDs, endpoints, width, layer, net
- via IDs, coordinates, drill, diameter, layer span
- junction objects and coordinates
- board geometry
- every supported design-rule field

Nulls, arrays in place of objects, missing required fields, invalid layer names, invalid numeric values, duplicate IDs, and unknown keys are covered by tests.

## Actual local verification

```text
pnpm exec vitest run shared/engineering.test.ts
1 test file passed
22 tests passed

pnpm check
passed

pnpm test
3 test files passed
28 tests passed

pnpm build
passed
```

The build prints the existing Vite warning about `/api/platform/config.js` lacking `type="module"`; the production bundle still completes successfully. This warning is unrelated to the engineering calculations.

## GitHub Actions

Before this change, the repository had no workflow and the GitHub API returned no workflow/check-run URL for commit `60bc18e`. A new workflow was added at `.github/workflows/engineering.yml`. It runs `pnpm check`, `pnpm test`, and `pnpm build` on pushes to `main` and `fix/**`, and on pull requests to `main`.

The workflow URL will be available after GitHub registers the pushed workflow:

https://github.com/soheil6913/-PCB-Studio-Pro/actions

`main` remains untouched and no merge was performed.
