# Follow-up engineering correction report

Branch: `fix/followup-pad-geometry-json-tolerance-20261119`

Base commit: `e578532b0de4e1342ce747de36fa9f536373751b`

## Reproduction before correction

A temporary dedicated suite, `shared/followup.pre.test.ts`, was run before implementation changes:

```text
Test Files  1 failed (1)
Tests       3 failed (3)
```

The three failures were:

1. Independent rectangular pad rotation was ignored by pad-to-pad clearance.
2. Junctions, pin fields, footprint identifier/courtyard, and pad nested fields were not all rejected when malformed.
3. `CONNECT_TOLERANCE = 1` connected a required pin to a wire with a visible 0.5-unit gap.

The temporary reproduction file was removed after its cases were promoted to permanent regression coverage.

## Corrections

### 1. Rotated rectangular and oval pad geometry

`localPads` now composes component rotation and independent pad rotation. Pad-to-pad clearance uses convex support geometry and a GJK distance test rather than axis-aligned bounding boxes or center-distance approximations. Rectangles, ovals, and circles have separate support functions. Track-to-rectangular-pad checks also transform rectangle corners by the composed pad rotation.

### 2. Nested JSON validation

Validation now checks:

- `junctions` array and every junction coordinate
- pin IDs, numbers, names, positions, required flags, and electrical type
- footprint identifier and pad array
- pad IDs, numbers, positions, dimensions, shape, layer/layers, drill, plating, and rotation
- courtyard object and positive finite width/height
- component layer and rotation

Invalid nested values return path-specific errors and do not reach DRC.

### 3. Topology tolerance

`CONNECT_TOLERANCE` is exported and reduced from `1` to `1e-7`. It is used only as a numerical/topology tolerance. A 0.5-unit visible gap remains disconnected, while a sub-tolerance gap is accepted as numerical noise. A regression test covers both boundaries.

## Post-correction results

```text
pnpm test   → passed
3 test files passed
25 tests passed

pnpm check  → passed

pnpm build  → passed
```

The production build still emits the pre-existing Vite warning that `/api/platform/config.js` lacks a `type="module"` attribute. This warning is unrelated to electrical calculations and DRC correctness.

The engineering test count increased from 19 to 20 in `shared/engineering.test.ts`; the full suite count increased from 22 to 25 because the server tests remain unchanged and the engineering suite gained the follow-up cases.

`main` was not modified and was not merged. The follow-up commit is isolated on this branch for review.
