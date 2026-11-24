# Geometry API Contract

This document describes the public geometry boundary implemented by `shared/engineering.ts`.

## Scalar helpers

`distance(a, b)` accepts finite `Point` values and returns the Euclidean distance. `measure(start, end, grid?)` accepts finite points and an optional numeric grid; it returns the distance and grid-unit projection, using pixel distance when `grid <= 0`. `snapToGrid(point, grid)` returns the original point when the grid is not positive. `rotatePoint(point, degrees)` and `transformLocalPoint(origin, local, rotation?)` accept numeric points and rotations and return transformed points. `segmentsIntersect(aStart, aEnd, bStart, bEnd)` returns a boolean for finite segment endpoints, including degenerate segments. `segmentDistance(...)` returns the segment-to-segment distance and is zero for intersecting segments. `route45(start, end)` returns a two- or three-point orthogonal/45-degree route.

These scalar helpers preserve their existing signatures and valid-input behavior. They are pure numeric helpers; callers that accept untrusted runtime data must validate the point shape before calling them.

## Detailed geometry APIs

`gjkWithinDistance(a, b, clearance, maxIterations = 64)` accepts two valid `Pad` geometries, a finite non-negative clearance, and a positive integer iteration budget. It returns `WITHIN_DISTANCE`, `OUTSIDE_DISTANCE`, or `INDETERMINATE`. Exhaustion remains `INDETERMINATE` with reason `iteration limit exhausted before convergence`. Malformed pads, clearance, or budget return `INDETERMINATE` with a stable reason and never throw.

`padToPadDistanceDetailed(a, b, options = {})` accepts valid pads and an options object containing only an optional positive safe-integer `gjkMaxIterations`. It returns either a finite `CONVERGED` distance or `INDETERMINATE`; malformed pads or options return `INDETERMINATE` with one of the stable boundary reasons (`invalid first pad geometry`, `invalid second pad geometry`, or `invalid geometry options`). It never leaks a runtime `TypeError` for malformed runtime inputs.

## Numeric compatibility wrappers

`padToPadDistance(a, b)` preserves its number-returning signature and valid-input results. If the detailed calculation is indeterminate or malformed, it throws `GeometryCalculationError` and never returns a plausible finite distance.

`viaToPadDistance(pad, via)` preserves its number-returning signature and valid-input results. A valid pad requires finite position, positive finite dimensions, a supported shape, equal dimensions for Circle, and finite rotation when present. A valid Via requires finite coordinates, a positive finite drill, and an effective diameter not smaller than the drill; the project validator separately preserves its established strict-diameter diagnostic. Invalid runtime geometry throws `GeometryCalculationError`.

## Validation and DRC boundaries

`validateSchematic` returns structured `DrcResult` findings and uses `SCH_INVALID_INPUT` for malformed direct schematic input. `validatePcb(project, options?)` validates the project root and geometry options before evaluation and returns structured `PCB_INVALID_INPUT` or `PCB_INVALID_OPTIONS` findings rather than throwing. `runDesignRules(project)` validates the complete project first and returns `PROJECT_INVALID` for malformed project input. `validateProjectJsonDetailed(value)` returns `{ ok, errors }` with stable paths and messages; `validateProjectJson(value)` is the corresponding type guard. `migrateProjectJson(value)` returns a validated `EngineeringProject` or `null`.

All DRC paths remain fail-closed: an indeterminate geometry calculation produces an error finding and is never converted into a clearance pass or a plausible finite result.
