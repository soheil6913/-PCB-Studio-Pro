export type Point = { x: number; y: number };
export type Severity = "Error" | "Warning" | "Info";
export type Layer = "F.Cu" | "B.Cu";
export type Pin = { id: string; number: string; name: string; position: Point; required?: boolean; electricalType?: string };
export type Pad = { id: string; number: string; position: Point; width: number; height: number; shape?: "circle" | "rect" | "oval"; layer: Layer; layers?: Layer[]; drill?: number; plated?: boolean; rotation?: number };
export type FootprintGeometry = { identifier: string; pads: Pad[]; courtyard?: { width: number; height: number } };
export type EngineeringComponent = { id: string; ref: string; value?: string; footprint?: string; x: number; y: number; rotation?: number; layer?: Layer; pins?: Pin[]; footprintGeometry?: FootprintGeometry };
export type EngineeringWire = { id: string; from: Point; to: Point; net?: string; junction?: boolean };
export type EngineeringTrack = { id: string; from: Point; to: Point; width: number; layer: Layer; net?: string };
export type EngineeringVia = { id: string; x: number; y: number; drill: number; diameter?: number; layers?: [Layer, Layer] };
export type DesignRules = { minimumTrackClearance?: number; copperToEdgeClearance?: number; minimumTrackWidth?: number; trackToViaClearance?: number; viaToPadClearance?: number; minimumViaClearance?: number; trackToPadClearance?: number; padToPadClearance?: number; minimumDrillDiameter?: number; minimumAnnularRing?: number };
export type Board = { x: number; y: number; width: number; height: number; edgeClearance?: number };
export type EngineeringProject = { schemaVersion?: number; projectName?: string; components: EngineeringComponent[]; wires: EngineeringWire[]; tracks: EngineeringTrack[]; vias: EngineeringVia[]; grid?: number; board?: Board; designRules?: DesignRules; junctions?: Point[] };
export type Measurement = { start: Point; end: Point; distance: number; gridUnits: number };
export type DrcResult = { id: string; ruleId: string; severity: Severity; objectIds: string[]; coordinates?: Point[]; explanation: string; correction: string };
export type ValidationError = { path: string; message: string };
export type GjkState = "WITHIN_DISTANCE" | "OUTSIDE_DISTANCE" | "INDETERMINATE";
export type GjkDecision = { state: GjkState; iterations: number; reason: string };
export type GeometryDistanceResult = { state: "CONVERGED"; distance: number; iterations: number; reason: string } | { state: "INDETERMINATE"; iterations: number; reason: string };
export type GeometryOptions = { gjkMaxIterations?: number };
export class GeometryCalculationError extends Error { constructor(public readonly reason: string) { super(`Geometry calculation indeterminate: ${reason}`); this.name = "GeometryCalculationError"; } }

export const CURRENT_PROJECT_VERSION = 2;
export const DEFAULT_BOARD: Board = { x: 150, y: 112, width: 660, height: 328, edgeClearance: 10 };
const EPSILON = 1e-7;
export const CONNECT_TOLERANCE = 1e-7;

export function distance(a: Point, b: Point) { return Math.hypot(b.x - a.x, b.y - a.y); }
export function measure(start: Point, end: Point, grid = 20): Measurement { const px = distance(start, end); return { start, end, distance: px, gridUnits: grid > 0 ? px / grid : px }; }
export function snapToGrid(point: Point, grid: number) { return grid > 0 ? { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid } : point; }
export function rotatePoint(point: Point, degrees: number) { const radians = degrees * Math.PI / 180; const cos = Math.cos(radians); const sin = Math.sin(radians); return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }; }
export function transformLocalPoint(origin: Point, local: Point, rotation = 0) { const rotated = rotatePoint(local, rotation); return { x: origin.x + rotated.x, y: origin.y + rotated.y }; }
export function route45(start: Point, end: Point): Point[] { const dx = end.x - start.x; const dy = end.y - start.y; if (Math.abs(dx) < EPSILON || Math.abs(dy) < EPSILON || Math.abs(Math.abs(dx) - Math.abs(dy)) < EPSILON) return [start, end]; const diagonal = Math.min(Math.abs(dx), Math.abs(dy)); return [start, { x: start.x + Math.sign(dx) * diagonal, y: start.y }, end]; }

function orientation(a: Point, b: Point, c: Point) {
  // Prefer translated differences (more accurate for large common offsets), then
  // scale before determinant products. If subtraction itself overflows, scale
  // coordinates first so finite extreme inputs still produce bounded deltas.
  let abx = b.x - a.x;
  let aby = b.y - a.y;
  let acx = c.x - a.x;
  let acy = c.y - a.y;
  if (![abx, aby, acx, acy].every(Number.isFinite)) {
    const coordinateScale = Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), Math.abs(c.x), Math.abs(c.y), Number.MIN_VALUE);
    abx = b.x / coordinateScale - a.x / coordinateScale;
    aby = b.y / coordinateScale - a.y / coordinateScale;
    acx = c.x / coordinateScale - a.x / coordinateScale;
    acy = c.y / coordinateScale - a.y / coordinateScale;
  }
  const scale = Math.max(Math.abs(abx), Math.abs(aby), Math.abs(acx), Math.abs(acy), Number.MIN_VALUE);
  abx /= scale;
  aby /= scale;
  acx /= scale;
  acy /= scale;
  const left = abx * acy;
  const right = aby * acx;
  const value = left - right;
  const roundoff = Number.EPSILON * (Math.abs(left) + Math.abs(right)) * 8;
  return Math.abs(value) <= roundoff ? 0 : value > 0 ? 1 : -1;
}
function onSegment(a: Point, b: Point, point: Point) {
  const coordinateScale = Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), Math.abs(point.x), Math.abs(point.y), Number.MIN_VALUE);
  const roundoff = Number.EPSILON * coordinateScale * 8;
  return point.x >= Math.min(a.x, b.x) - roundoff && point.x <= Math.max(a.x, b.x) + roundoff && point.y >= Math.min(a.y, b.y) - roundoff && point.y <= Math.max(a.y, b.y) + roundoff;
}
export function segmentsIntersect(aStart: Point, aEnd: Point, bStart: Point, bEnd: Point) { const aZero = aStart.x === aEnd.x && aStart.y === aEnd.y; const bZero = bStart.x === bEnd.x && bStart.y === bEnd.y; if (aZero && bZero) return distance(aStart, bStart) <= EPSILON; if (aZero) return orientation(bStart, bEnd, aStart) === 0 && onSegment(bStart, bEnd, aStart); if (bZero) return orientation(aStart, aEnd, bStart) === 0 && onSegment(aStart, aEnd, bStart); const o1 = orientation(aStart, aEnd, bStart); const o2 = orientation(aStart, aEnd, bEnd); const o3 = orientation(bStart, bEnd, aStart); const o4 = orientation(bStart, bEnd, aEnd); return o1 !== o2 && o3 !== o4 || o1 === 0 && onSegment(aStart, aEnd, bStart) || o2 === 0 && onSegment(aStart, aEnd, bEnd) || o3 === 0 && onSegment(bStart, bEnd, aStart) || o4 === 0 && onSegment(bStart, bEnd, aEnd); }
function pointToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return distance(point, start);
  if (!Number.isFinite(length)) return Number.NaN;
  const unitX = dx / length;
  const unitY = dy / length;
  const projection = ((point.x - start.x) * unitX + (point.y - start.y) * unitY) / length;
  const t = Math.max(0, Math.min(1, projection));
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
}
export function segmentDistance(aStart: Point, aEnd: Point, bStart: Point, bEnd: Point) { if (segmentsIntersect(aStart, aEnd, bStart, bEnd)) return 0; return Math.min(pointToSegment(aStart, bStart, bEnd), pointToSegment(aEnd, bStart, bEnd), pointToSegment(bStart, aStart, aEnd), pointToSegment(bEnd, aStart, aEnd)); }

function result(ruleId: string, severity: Severity, objectIds: string[], explanation: string, correction: string, coordinates?: Point[]): DrcResult { return { id: `${ruleId}:${objectIds.join(",")}`, ruleId, severity, objectIds, coordinates, explanation, correction }; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
type ClearanceState = "CLEAR" | "VIOLATION" | "INDETERMINATE";
function compareClearance(actual: number, required: number): ClearanceState {
  if (!Number.isFinite(actual) || !Number.isFinite(required)) return "INDETERMINATE";
  if (actual >= required) return "CLEAR";
  const shortfall = required - actual;
  const uncertainty = Number.EPSILON * Math.max(Math.abs(actual), Math.abs(required), Number.MIN_VALUE) * 16;
  return shortfall <= uncertainty ? "INDETERMINATE" : "VIOLATION";
}
function validPoint(value: unknown): value is Point { return !!value && typeof value === "object" && finite((value as Point).x) && finite((value as Point).y); }
function boardContains(point: Point, board: Board, margin = 0) {
  const left = board.x + margin;
  const right = board.x + board.width - margin;
  const top = board.y + margin;
  const bottom = board.y + board.height - margin;
  return Number.isFinite(left) && Number.isFinite(right) && Number.isFinite(top) && Number.isFinite(bottom) && point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}
function segmentInsideRect(start: Point, end: Point, board: Board, margin: number) { return boardContains(start, board, margin) && boardContains(end, board, margin); }
function padLayers(pad: Pad): Layer[] { if (pad.layers?.length) return pad.layers; return pad.plated && pad.drill !== undefined ? ["F.Cu", "B.Cu"] : [pad.layer]; }
function localPads(component: EngineeringComponent) { return component.footprintGeometry?.pads.map(pad => ({ ...pad, position: transformLocalPoint({ x: component.x, y: component.y }, pad.position, component.rotation ?? 0), rotation: (component.rotation ?? 0) + (pad.rotation ?? 0) })) ?? []; }
function padAxisAlignedHalfExtents(pad: Pad) {
  const shape = pad.shape ?? "rect";
  const radians = (pad.rotation ?? 0) * Math.PI / 180;
  const c = Math.abs(Math.cos(radians));
  const s = Math.abs(Math.sin(radians));
  if (shape === "rect") return { x: c * pad.width / 2 + s * pad.height / 2, y: s * pad.width / 2 + c * pad.height / 2 };
  const rx = pad.width / 2;
  const ry = shape === "circle" ? rx : pad.height / 2;
  return { x: Math.hypot(rx * c, ry * s), y: Math.hypot(rx * s, ry * c) };
}
type Vector = Point;
function dot(a: Vector, b: Vector) { return a.x * b.x + a.y * b.y; }
function negate(a: Vector): Vector { return { x: -a.x, y: -a.y }; }
function sub(a: Vector, b: Vector): Vector { return { x: a.x - b.x, y: a.y - b.y }; }
function triple(a: Vector, b: Vector, c: Vector): Vector { const ac = dot(a, c); const ab = dot(a, b); return { x: b.x * ac - c.x * ab, y: b.y * ac - c.y * ab }; }
function supportPad(pad: Pad, direction: Vector): Point { const rotation = (pad.rotation ?? 0) * Math.PI / 180; const c = Math.cos(rotation); const s = Math.sin(rotation); const local = { x: direction.x * c + direction.y * s, y: -direction.x * s + direction.y * c }; const shape = pad.shape ?? "rect"; let point: Point; if (shape === "rect") point = { x: Math.sign(local.x || 1) * pad.width / 2, y: Math.sign(local.y || 1) * pad.height / 2 }; else { const rx = pad.width / 2; const ry = shape === "circle" ? pad.width / 2 : pad.height / 2; const denominator = Math.hypot(rx * local.x, ry * local.y) || 1; point = { x: rx * rx * local.x / denominator, y: ry * ry * local.y / denominator }; } return { x: pad.position.x + point.x * c - point.y * s, y: pad.position.y + point.x * s + point.y * c }; }
function supportMinkowski(a: Pad, b: Pad, direction: Vector, clearance: number): Point { const length = Math.hypot(direction.x, direction.y) || 1; const unit = { x: direction.x / length, y: direction.y / length }; const pa = supportPad(a, direction); const pb = supportPad(b, negate(direction)); return { x: pa.x - pb.x + unit.x * clearance, y: pa.y - pb.y + unit.y * clearance }; }
export function gjkWithinDistance(
  a: Pad,
  b: Pad,
  clearance: number,
  maxIterations = 64,
): GjkDecision {
  if (!Number.isInteger(maxIterations) || maxIterations < 1)
    return { state: "INDETERMINATE", iterations: 0, reason: "invalid iteration budget" };

  const centerDelta = sub(a.position, b.position);
  const scale = Math.max(
    Math.abs(a.width), Math.abs(a.height), Math.abs(b.width), Math.abs(b.height),
    Math.abs(clearance), Math.hypot(centerDelta.x, centerDelta.y), Number.MIN_VALUE,
  );
  if (!Number.isFinite(scale))
    return { state: "INDETERMINATE", iterations: 0, reason: "non-finite geometry scale" };
  // Tolerances are relative to the local geometry, with no unit-sized absolute
  // floor. The residual tolerance has squared-length units.
  const tolerance = Number.EPSILON * scale * 64;
  const residualTolerance = Number.EPSILON * scale * scale * 128;
  let direction = centerDelta;
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y))
    return { state: "INDETERMINATE", iterations: 0, reason: "non-finite initial direction" };
  if (direction.x === 0 && direction.y === 0) direction = { x: 1, y: 0 };

  const first = supportMinkowski(a, b, direction, clearance);
  if (!Number.isFinite(first.x) || !Number.isFinite(first.y))
    return { state: "INDETERMINATE", iterations: 0, reason: "non-finite initial support point" };
  const initialDot = dot(first, direction);
  if (!Number.isFinite(initialDot))
    return { state: "INDETERMINATE", iterations: 0, reason: "non-finite initial support dot product" };
  if (initialDot < 0)
    return { state: "OUTSIDE_DISTANCE", iterations: 0, reason: "initial support point excludes the origin" };

  const simplex: Point[] = [first];
  direction = negate(first);
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const directionLength = Math.hypot(direction.x, direction.y);
    if (!Number.isFinite(directionLength))
      return { state: "INDETERMINATE", iterations: iteration - 1, reason: "non-finite search direction" };
    if (directionLength <= tolerance) {
      // A short direction alone is not an overlap proof. Only accept an exact
      // origin support point; otherwise precision is insufficient to decide.
      if (simplex.length === 1 && simplex[0].x === 0 && simplex[0].y === 0)
        return { state: "WITHIN_DISTANCE", iterations: iteration - 1, reason: "origin is an exact Minkowski support point" };
      if (simplex.length === 2) {
        const segment = sub(simplex[0], simplex[1]);
        const fromA = negate(simplex[1]);
        const segmentLengthSquared = dot(segment, segment);
        const cross = segment.x * fromA.y - segment.y * fromA.x;
        const projection = dot(fromA, segment);
        if (cross === 0 && projection >= 0 && projection <= segmentLengthSquared)
          return { state: "WITHIN_DISTANCE", iterations: iteration - 1, reason: "simplex segment contains the origin" };
      }
      return { state: "INDETERMINATE", iterations: iteration - 1, reason: "search direction reached numerical resolution without a conclusive simplex" };
    }

    const point = supportMinkowski(a, b, direction, clearance);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
      return { state: "INDETERMINATE", iterations: iteration, reason: "non-finite support point" };
    const supportDot = dot(point, direction);
    if (!Number.isFinite(supportDot))
      return { state: "INDETERMINATE", iterations: iteration, reason: "non-finite support dot product" };
    if (supportDot < 0)
      return { state: "OUTSIDE_DISTANCE", iterations: iteration, reason: "support point excludes the origin" };

    if (simplex.some(existing => distance(existing, point) <= tolerance)) {
      if (Math.abs(supportDot) <= residualTolerance)
        return { state: "WITHIN_DISTANCE", iterations: iteration, reason: "duplicate support point with scale-relative zero residual" };
      return { state: "INDETERMINATE", iterations: iteration, reason: "duplicate support point before conclusive classification" };
    }

    simplex.push(point);
    const aPoint = simplex[simplex.length - 1];
    const ao = negate(aPoint);
    if (simplex.length === 2) {
      const ab = sub(simplex[0], aPoint);
      direction = triple(ab, ao, ab);
      if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y))
        return { state: "INDETERMINATE", iterations: iteration, reason: "non-finite line-simplex direction" };
      if (Math.hypot(direction.x, direction.y) <= tolerance) {
        const abLengthSquared = dot(ab, ab);
        const projection = dot(ao, ab);
        const cross = ab.x * ao.y - ab.y * ao.x;
        if (cross === 0 && projection >= 0 && projection <= abLengthSquared)
          return { state: "WITHIN_DISTANCE", iterations: iteration, reason: "line simplex contains the origin" };
        return { state: "INDETERMINATE", iterations: iteration, reason: "line simplex is numerically degenerate" };
      }
    } else {
      const bPoint = simplex[1];
      const cPoint = simplex[0];
      const ab = sub(bPoint, aPoint);
      const ac = sub(cPoint, aPoint);
      const abPerp = triple(ac, ab, ab);
      const acPerp = triple(ab, ac, ac);
      const abDot = dot(abPerp, ao);
      const acDot = dot(acPerp, ao);
      if (!Number.isFinite(abDot) || !Number.isFinite(acDot))
        return { state: "INDETERMINATE", iterations: iteration, reason: "non-finite simplex test" };
      if (abDot > 0) { simplex.splice(0, 1); direction = abPerp; }
      else if (acDot > 0) { simplex.splice(1, 1); direction = acPerp; }
      else return { state: "WITHIN_DISTANCE", iterations: iteration, reason: "triangle simplex encloses the origin" };
    }
  }
  return { state: "INDETERMINATE", iterations: maxIterations, reason: "iteration limit exhausted before convergence" };
}
function rectCorners(pad: Pad): Point[] { const ext = { x: pad.width / 2, y: pad.height / 2 }; const radians = (pad.rotation ?? 0) * Math.PI / 180; const c = Math.cos(radians); const s = Math.sin(radians); return [{ x: -ext.x, y: -ext.y }, { x: ext.x, y: -ext.y }, { x: ext.x, y: ext.y }, { x: -ext.x, y: ext.y }].map(point => ({ x: pad.position.x + point.x * c - point.y * s, y: pad.position.y + point.x * s + point.y * c })); }
function strictOrientation(a: Point, b: Point, c: Point) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function strictOnSegment(a: Point, b: Point, point: Point) { return point.x >= Math.min(a.x, b.x) - 1e-12 && point.x <= Math.max(a.x, b.x) + 1e-12 && point.y >= Math.min(a.y, b.y) - 1e-12 && point.y <= Math.max(a.y, b.y) + 1e-12; }
function strictSegmentsIntersect(aStart: Point, aEnd: Point, bStart: Point, bEnd: Point) { const o1 = strictOrientation(aStart, aEnd, bStart); const o2 = strictOrientation(aStart, aEnd, bEnd); const o3 = strictOrientation(bStart, bEnd, aStart); const o4 = strictOrientation(bStart, bEnd, aEnd); const sign = (value: number) => Math.abs(value) <= 1e-12 ? 0 : value > 0 ? 1 : -1; const s1 = sign(o1); const s2 = sign(o2); const s3 = sign(o3); const s4 = sign(o4); return s1 !== s2 && s3 !== s4 || s1 === 0 && strictOnSegment(aStart, aEnd, bStart) || s2 === 0 && strictOnSegment(aStart, aEnd, bEnd) || s3 === 0 && strictOnSegment(bStart, bEnd, aStart) || s4 === 0 && strictOnSegment(bStart, bEnd, aEnd); }
function strictSegmentDistance(aStart: Point, aEnd: Point, bStart: Point, bEnd: Point) { if (strictSegmentsIntersect(aStart, aEnd, bStart, bEnd)) return 0; return Math.min(pointToSegment(aStart, bStart, bEnd), pointToSegment(aEnd, bStart, bEnd), pointToSegment(bStart, aStart, aEnd), pointToSegment(bEnd, aStart, aEnd)); }
function pointInConvexPolygon(point: Point, polygon: Point[]) { let sign = 0; for (let i = 0; i < polygon.length; i += 1) { const cross = strictOrientation(polygon[i], polygon[(i + 1) % polygon.length], point); if (Math.abs(cross) <= 1e-12) continue; const next = cross > 0 ? 1 : -1; if (sign && sign !== next) return false; sign = next; } return true; }
function rectToRectDistance(a: Pad, b: Pad) { const origin = { x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 }; const aCorners = rectCorners(localizePad(a, origin)); const bCorners = rectCorners(localizePad(b, origin)); if (aCorners.some(point => pointInConvexPolygon(point, bCorners)) || bCorners.some(point => pointInConvexPolygon(point, aCorners))) return 0; let best = Infinity; for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) { best = Math.min(best, strictSegmentDistance(aCorners[i], aCorners[(i + 1) % 4], bCorners[j], bCorners[(j + 1) % 4])); } return best; }
function rectToOvalDistance(rect: Pad, oval: Pad) { const corners = rectCorners(rect); if (corners.some(corner => pointToEllipseBoundaryDistance(corner, oval) === 0) || pointToRectBoundaryDistance(oval.position, rect) === 0) return 0; let best = Infinity; for (let i = 0; i < 4; i += 1) best = Math.min(best, segmentToEllipseDistance(corners[i], corners[(i + 1) % 4], oval)); return best; }
function localizePad(pad: Pad, origin: Point): Pad { return { ...pad, position: { x: pad.position.x - origin.x, y: pad.position.y - origin.y } }; }
function commonAxisOvalDistance(a: Pad, b: Pad): number | null {
  const maxSafeRadius = Math.sqrt(Number.MAX_VALUE) / 4;
  const inputs = [a.position.x, a.position.y, b.position.x, b.position.y, a.width, a.height, b.width, b.height];
  if (!inputs.every(Number.isFinite) || Math.max(Math.abs(a.width), Math.abs(a.height), Math.abs(b.width), Math.abs(b.height)) > maxSafeRadius) return null;
  const angleDifference = (b.rotation ?? 0) - (a.rotation ?? 0);
  if (!Number.isFinite(angleDifference) || angleDifference % 180 !== 0) return null;
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const radians = (a.rotation ?? 0) * Math.PI / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const localX = dx * c + dy * s;
  const localY = -dx * s + dy * c;
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) return null;
  const axisTolerance = Number.EPSILON * Math.max(Math.abs(dx), Math.abs(dy), Number.MIN_VALUE) * 16;
  const xAligned = Math.abs(localX) <= axisTolerance;
  const yAligned = Math.abs(localY) <= axisTolerance;
  if (xAligned && yAligned) return 0;
  if (xAligned) return Math.max(0, Math.abs(localY) - a.height / 2 - b.height / 2);
  if (yAligned) return Math.max(0, Math.abs(localX) - a.width / 2 - b.width / 2);
  return null;
}
function exactDistance(value: number, reason: string): GeometryDistanceResult { return Number.isFinite(value) && value >= 0 ? { state: "CONVERGED", distance: value, iterations: 0, reason } : { state: "INDETERMINATE", iterations: 0, reason: `${reason} produced a non-finite or invalid distance` }; }
export function padToPadDistanceDetailed(a: Pad, b: Pad, options: GeometryOptions = {}): GeometryDistanceResult { const aShape = a.shape ?? "rect"; const bShape = b.shape ?? "rect"; if (aShape === "circle" && bShape === "circle") return exactDistance(Math.max(0, distance(a.position, b.position) - a.width / 2 - b.width / 2), "analytic circle-circle distance"); if (aShape === "circle") return exactDistance(viaToPadDistance(b, { id: `pad:${a.id}`, x: a.position.x, y: a.position.y, drill: a.width / 2, diameter: a.width }), "analytic circle-to-pad distance"); if (bShape === "circle") return exactDistance(viaToPadDistance(a, { id: `pad:${b.id}`, x: b.position.x, y: b.position.y, drill: b.width / 2, diameter: b.width }), "analytic circle-to-pad distance"); if (aShape === "rect" && bShape === "rect") return exactDistance(rectToRectDistance(a, b), "exact convex rectangle distance"); if (aShape === "rect" && bShape === "oval") return exactDistance(rectToOvalDistance(a, b), "edge-to-ellipse distance"); if (aShape === "oval" && bShape === "rect") return exactDistance(rectToOvalDistance(b, a), "edge-to-ellipse distance"); if (aShape === "oval" && bShape === "oval") { const axisDistance = commonAxisOvalDistance(a, b); if (axisDistance !== null) return exactDistance(axisDistance, "analytic common-axis ellipse distance"); } const maxIterations = options.gjkMaxIterations ?? 64; const origin = { x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 }; const localA = localizePad(a, origin); const localB = localizePad(b, origin); const initial = gjkWithinDistance(localA, localB, 0, maxIterations); if (initial.state === "INDETERMINATE") return { state: "INDETERMINATE", iterations: initial.iterations, reason: `initial overlap query: ${initial.reason}` }; if (initial.state === "WITHIN_DISTANCE") return exactDistance(0, "converged overlap query"); let low = 0; let high = distance(localA.position, localB.position) + Math.max(a.width, a.height, b.width, b.height); if (!Number.isFinite(high)) return { state: "INDETERMINATE", iterations: initial.iterations, reason: "non-finite binary-search upper bound" }; for (let i = 0; i < 64; i += 1) { const middle = (low + high) / 2; const decision = gjkWithinDistance(localA, localB, middle, maxIterations); if (decision.state === "INDETERMINATE") return { state: "INDETERMINATE", iterations: decision.iterations, reason: `binary-search iteration ${i + 1}: ${decision.reason}` }; if (decision.state === "WITHIN_DISTANCE") high = middle; else low = middle; } return { state: "CONVERGED", distance: high, iterations: 64, reason: "binary search converged with valid GJK classifications" }; }
export function padToPadDistance(a: Pad, b: Pad): number { const calculation = padToPadDistanceDetailed(a, b); if (calculation.state === "INDETERMINATE") throw new GeometryCalculationError(calculation.reason); return calculation.distance; }
function padLocalPoint(pad: Pad, point: Point) { const radians = -(pad.rotation ?? 0) * Math.PI / 180; const c = Math.cos(radians); const s = Math.sin(radians); const dx = point.x - pad.position.x; const dy = point.y - pad.position.y; return { x: dx * c - dy * s, y: dx * s + dy * c }; }
function pointToRectBoundaryDistance(point: Point, pad: Pad) { const local = padLocalPoint(pad, point); const dx = Math.max(Math.abs(local.x) - pad.width / 2, 0); const dy = Math.max(Math.abs(local.y) - pad.height / 2, 0); if (Math.abs(local.x) <= pad.width / 2 && Math.abs(local.y) <= pad.height / 2) return 0; return Math.hypot(dx, dy); }
function pointToEllipseBoundaryDistance(point: Point, pad: Pad) { const local = padLocalPoint(pad, point); const rx = pad.width / 2; const ry = (pad.shape === "circle" ? pad.width : pad.height) / 2; const x = Math.abs(local.x); const y = Math.abs(local.y); if (x === 0 && y === 0) return 0; const normalized = (x * x) / (rx * rx) + (y * y) / (ry * ry); if (normalized < 1) return 0; const f = (lambda: number) => (rx * rx * x * x) / ((lambda + rx * rx) ** 2) + (ry * ry * y * y) / ((lambda + ry * ry) ** 2) - 1; let low = normalized >= 1 ? 0 : -Math.min(rx * rx, ry * ry) * (1 - 1e-12); let high = normalized >= 1 ? Math.max(rx * x, ry * y) : 0; while (f(high) > 0) high = high * 2 + 1; for (let i = 0; i < 96; i += 1) { const middle = (low + high) / 2; if (f(middle) > 0) low = middle; else high = middle; } const lambda = (low + high) / 2; const nearest = { x: rx * rx * x / (lambda + rx * rx), y: ry * ry * y / (lambda + ry * ry) }; return Math.hypot(nearest.x - x, nearest.y - y); }
export function viaToPadDistance(pad: Pad, via: EngineeringVia): number { const viaRadius = (via.diameter ?? via.drill * 2) / 2; const center = { x: via.x, y: via.y }; const boundaryDistance = (pad.shape ?? "rect") === "rect" ? pointToRectBoundaryDistance(center, pad) : pointToEllipseBoundaryDistance(center, pad); return Math.max(0, boundaryDistance - viaRadius); }
function halfExtents(pad: Pad) { return { x: pad.width / 2, y: pad.height / 2 }; }
function segmentToEllipseDistance(start: Point, end: Point, pad: Pad) { const evaluate = (t: number) => pointToEllipseBoundaryDistance({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }, pad); let low = 0; let high = 1; for (let i = 0; i < 96; i += 1) { const left = low + (high - low) / 3; const right = high - (high - low) / 3; if (evaluate(left) <= evaluate(right)) high = right; else low = left; } return Math.min(evaluate(0), evaluate(1), evaluate((low + high) / 2)); }
function segmentToPadDistance(start: Point, end: Point, pad: Pad): number { const shape = pad.shape ?? "rect"; if (shape === "circle") return Math.max(0, pointToSegment(pad.position, start, end) - pad.width / 2); if (shape === "oval") return segmentToEllipseDistance(start, end, pad); const ext = halfExtents(pad); const radians = (pad.rotation ?? 0) * Math.PI / 180; const c = Math.cos(radians); const s = Math.sin(radians); const toLocal = (point: Point) => { const dx = point.x - pad.position.x; const dy = point.y - pad.position.y; return { x: dx * c + dy * s, y: -dx * s + dy * c }; }; const inside = (point: Point) => { const local = toLocal(point); return Math.abs(local.x) <= ext.x + EPSILON && Math.abs(local.y) <= ext.y + EPSILON; }; if (inside(start) || inside(end)) return 0; const fromLocal = (point: Point) => ({ x: pad.position.x + point.x * c - point.y * s, y: pad.position.y + point.x * s + point.y * c }); const corners: Point[] = [fromLocal({ x: -ext.x, y: -ext.y }), fromLocal({ x: ext.x, y: -ext.y }), fromLocal({ x: ext.x, y: ext.y }), fromLocal({ x: -ext.x, y: ext.y })]; let best = Infinity; for (let i = 0; i < 4; i += 1) best = Math.min(best, segmentDistance(start, end, corners[i], corners[(i + 1) % 4])); return best; }
function pointKey(point: Point) { return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`; }

export function validateSchematic(project: Pick<EngineeringProject, "components" | "wires" | "junctions">): DrcResult[] {
  const candidate = project as unknown;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return [result("SCH_INVALID_INPUT", "Error", [], "Schematic input is invalid at $.", "Schematic input must be a non-null object.")];
  }
  const input = candidate as { components?: unknown; wires?: unknown; junctions?: unknown };
  const validation = validateProjectJsonDetailed({
    components: input.components,
    wires: input.wires,
    tracks: [],
    vias: [],
    junctions: input.junctions,
  });
  if (!validation.ok) {
    const first = validation.errors[0] ?? { path: "$", message: "invalid schematic input" };
    return [result("SCH_INVALID_INPUT", "Error", [], `Schematic input is invalid at ${first.path}.`, first.message)];
  }
  const normalized = input as Pick<EngineeringProject, "components" | "wires" | "junctions">;
  const findings: DrcResult[] = []; const refs = new Map<string, EngineeringComponent[]>(); const ids = new Set<string>();
  normalized.components.forEach(component => { refs.set(component.ref, [...(refs.get(component.ref) ?? []), component]); if (ids.has(component.id)) findings.push(result("SCH_DUPLICATE_COMPONENT_ID", "Error", [component.id], `Component ID ${component.id} is duplicated.`, "Assign a stable unique component ID.")); ids.add(component.id); });
  refs.forEach((items, ref) => { if (items.length > 1) findings.push(result("SCH_DUPLICATE_REFERENCE", "Error", items.map(item => item.id), `Reference ${ref} is used more than once.`, "Assign a unique reference designator.")); });
  normalized.components.forEach(component => { if (!component.value?.trim()) findings.push(result("SCH_MISSING_VALUE", "Warning", [component.id], `${component.ref} has no value.`, "Set a value before generating a BOM.")); if (!component.pins?.length) findings.push(result("SCH_UNVERIFIED_PIN_GEOMETRY", "Info", [component.id], `${component.ref} has no verified pin geometry; pin connectivity is not fully validated.`, "Attach a verified symbol definition with pin coordinates.")); });
  const wireIds = new Set<string>(); normalized.wires.forEach(wire => { if (wireIds.has(wire.id)) findings.push(result("SCH_DUPLICATE_WIRE_ID", "Error", [wire.id], `Wire ID ${wire.id} is duplicated.`, "Assign a stable unique wire ID.")); wireIds.add(wire.id); if (!validPoint(wire.from) || !validPoint(wire.to)) findings.push(result("SCH_INVALID_WIRE_ENDPOINT", "Error", [wire.id], "Wire endpoint coordinates are invalid.", "Repair the wire endpoints.")); });
  const nodes: Point[] = []; const addNode = (point: Point) => { const existing = nodes.findIndex(candidate => distance(candidate, point) <= CONNECT_TOLERANCE); if (existing >= 0) return existing; nodes.push(point); return nodes.length - 1; }; const parent: number[] = []; const find = (index: number): number => { if (parent[index] === index) return index; parent[index] = find(parent[index]); return parent[index]; }; const union = (a: number, b: number) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const wireNodeIds = normalized.wires.map(wire => { const a = addNode(wire.from); const b = addNode(wire.to); while (parent.length < nodes.length) parent.push(parent.length); union(a, b); return { wire, a, b }; });
  normalized.junctions?.forEach(junction => { const node = addNode(junction); while (parent.length < nodes.length) parent.push(parent.length); wireNodeIds.forEach(({ wire, a }) => { if (pointToSegment(junction, wire.from, wire.to) <= CONNECT_TOLERANCE) union(node, a); }); });
  const pinNodes = normalized.components.flatMap(component => (component.pins ?? []).map(pin => { const point = transformLocalPoint({ x: component.x, y: component.y }, pin.position, component.rotation ?? 0); const node = addNode(point); while (parent.length < nodes.length) parent.push(parent.length); wireNodeIds.forEach(({ wire, a }) => { if (pointToSegment(point, wire.from, wire.to) <= CONNECT_TOLERANCE) union(node, a); }); return { id: `${component.id}:${pin.id}`, point, node, required: pin.required !== false }; }));
  const junctionAtIntersection = (a: EngineeringWire, b: EngineeringWire) => normalized.junctions?.some(point => pointToSegment(point, a.from, a.to) <= CONNECT_TOLERANCE && pointToSegment(point, b.from, b.to) <= CONNECT_TOLERANCE) ?? false;
  for (let i = 0; i < wireNodeIds.length; i += 1) for (let j = i + 1; j < wireNodeIds.length; j += 1) { const a = wireNodeIds[i]; const b = wireNodeIds[j]; if (!segmentsIntersect(a.wire.from, a.wire.to, b.wire.from, b.wire.to)) continue; const endpointTouch = [a.wire.from, a.wire.to].some(point => pointToSegment(point, b.wire.from, b.wire.to) <= CONNECT_TOLERANCE) || [b.wire.from, b.wire.to].some(point => pointToSegment(point, a.wire.from, a.wire.to) <= CONNECT_TOLERANCE); if (endpointTouch || junctionAtIntersection(a.wire, b.wire)) union(a.a, b.a); else findings.push(result("SCH_CROSSING_WITHOUT_JUNCTION", "Warning", [a.wire.id, b.wire.id], "Two wires cross without an explicit junction and are not electrically joined.", "Add a junction or route without crossing.")); }
  pinNodes.forEach(pin => { if (pin.required && !wireNodeIds.some(({ a }) => find(a) === find(pin.node))) findings.push(result("SCH_UNCONNECTED_REQUIRED_PIN", "Error", [pin.id], `Required pin ${pin.id} is not connected to a wire.`, "Connect the pin to a net or mark it intentionally unused.", [pin.point])); });
  const netRoots = new Map<string, Set<number>>(); wireNodeIds.forEach(({ wire, a }) => { if (!wire.net) return; const roots = netRoots.get(wire.net) ?? new Set<number>(); roots.add(find(a)); netRoots.set(wire.net, roots); }); netRoots.forEach((roots, net) => { if (roots.size > 1) findings.push(result("SCH_DISCONNECTED_NET", "Error", [...roots].map(String), `Net ${net} contains disconnected geometric components.`, "Join the segments or correct the net label.")); }); const rootNets = new Map<number, Set<string>>(); netRoots.forEach((roots, net) => roots.forEach(root => rootNets.set(root, new Set([...(rootNets.get(root) ?? []), net])))); rootNets.forEach((nets, root) => { if (nets.size > 1) findings.push(result("SCH_NET_NAME_CONFLICT", "Error", [...nets], `Different net names share the same geometric connection at node ${root}.`, "Resolve the short or correct the net labels.")); });
  return findings;
}

function evaluatePcbV2(project: Pick<EngineeringProject, "components" | "tracks" | "vias"> & Partial<Pick<EngineeringProject, "board" | "designRules">>, options: GeometryOptions = {}): DrcResult[] {
  // Stable public-boundary diagnostic for malformed PCB-only runtime input.
  const candidate = project as unknown;
  const validationInput = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? {
        components: (candidate as { components?: unknown }).components,
        wires: [],
        tracks: (candidate as { tracks?: unknown }).tracks,
        vias: (candidate as { vias?: unknown }).vias,
        board: (candidate as { board?: unknown }).board,
        designRules: (candidate as { designRules?: unknown }).designRules,
      }
    : candidate;
  const validation = validateProjectJsonDetailed(validationInput);
  const legacyViaGeometryErrorsOnly = validation.errors.length > 0 && validation.errors.every(error =>
    /^vias\[\d+\]\.diameter$/.test(error.path) && error.message === "must be greater than drill",
  );
  if (!validation.ok && !legacyViaGeometryErrorsOnly) {
    const first = validation.errors[0] ?? { path: "$", message: "invalid PCB input" };
    return [result("PCB_INVALID_INPUT", "Error", [], `PCB input is invalid at ${first.path}.`, first.message)];
  }
  const board = project.board ?? DEFAULT_BOARD; const rules = project.designRules ?? {}; const findings: DrcResult[] = []; const trackIds = new Set<string>();
  project.tracks.forEach(track => { if (trackIds.has(track.id)) findings.push(result("PCB_DUPLICATE_TRACK_ID", "Error", [track.id], `Track ID ${track.id} is duplicated.`, "Assign a stable unique track ID.")); trackIds.add(track.id); if (!finite(track.width) || track.width <= 0) findings.push(result("PCB_INVALID_TRACK_WIDTH", "Error", [track.id], "Track width must be positive and finite.", "Set a valid track width.")); if (rules.minimumTrackClearance === undefined) findings.push(result("PCB_RULE_UNCONFIGURED", "Info", [track.id], "Track-to-track clearance cannot be fully validated because minimumTrackClearance is not configured.", "Configure project-specific design rules.")); const margin = track.width / 2 + (rules.copperToEdgeClearance ?? board.edgeClearance ?? 0); if (!segmentInsideRect(track.from, track.to, board, margin)) findings.push(result("PCB_EDGE_CLEARANCE", "Error", [track.id], "The complete track geometry violates copper-to-board-edge clearance.", "Move the route inward.")); if (rules.minimumTrackWidth !== undefined && track.width < rules.minimumTrackWidth) findings.push(result("PCB_MINIMUM_TRACK_WIDTH", "Error", [track.id], `Track width ${track.width} is below minimum ${rules.minimumTrackWidth}.`, "Increase the track width.")); });
  for (let i = 0; i < project.tracks.length; i += 1) for (let j = i + 1; j < project.tracks.length; j += 1) { const a = project.tracks[i]; const b = project.tracks[j]; if (a.layer !== b.layer || rules.minimumTrackClearance === undefined) continue; const actual = segmentDistance(a.from, a.to, b.from, b.to); const state = compareClearance(actual, (a.width + b.width) / 2 + rules.minimumTrackClearance); if (state === "INDETERMINATE") findings.push(result("PCB_GEOMETRY_INDETERMINATE", "Error", [a.id, b.id], "Track-to-track clearance is within numerical uncertainty or has a non-finite result.", "Do not accept the board until the geometry calculation is numerically stable.", [a.from, a.to, b.from, b.to])); else if (state === "VIOLATION") findings.push(result("PCB_TRACK_CLEARANCE", "Error", [a.id, b.id], `Tracks are ${actual.toFixed(2)} units apart; ${rules.minimumTrackClearance} units is required.`, "Reroute one track or increase spacing.", [a.from, a.to, b.from, b.to])); }
  const allPads = project.components.flatMap(component => localPads(component).map(pad => ({ component, pad })));
  const edgeClearance = rules.copperToEdgeClearance ?? board.edgeClearance ?? 0;
  allPads.forEach(({ component, pad }) => {
    const half = padAxisAlignedHalfExtents(pad);
    const bounds = { left: pad.position.x - half.x, right: pad.position.x + half.x, top: pad.position.y - half.y, bottom: pad.position.y + half.y };
    if (![half.x, half.y, bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)) findings.push(result("PCB_GEOMETRY_INDETERMINATE", "Error", [component.id, pad.id], "Pad-to-board-edge clearance could not be verified because transformed pad bounds were non-finite.", "Do not accept the board until the geometry calculation is numerically stable."));
    else if (bounds.left < board.x + edgeClearance || bounds.right > board.x + board.width - edgeClearance || bounds.top < board.y + edgeClearance || bounds.bottom > board.y + board.height - edgeClearance) findings.push(result("PCB_PAD_EDGE_CLEARANCE", "Error", [component.id, pad.id], `Pad ${pad.id} violates copper-to-board-edge clearance.`, "Move the pad inward or increase board clearance.", [pad.position]));
  });
  allPads.forEach(({ component: aComponent, pad: a }) => { project.tracks.forEach(track => { if (!padLayers(a).includes(track.layer) || rules.trackToPadClearance === undefined) return; const actual = segmentToPadDistance(track.from, track.to, a); const state = compareClearance(actual, track.width / 2 + rules.trackToPadClearance); if (state === "INDETERMINATE") findings.push(result("PCB_GEOMETRY_INDETERMINATE", "Error", [track.id, aComponent.id, a.id], "Track-to-pad clearance is within numerical uncertainty or has a non-finite result.", "Do not accept the board until the geometry calculation is numerically stable.")); else if (state === "VIOLATION") findings.push(result("PCB_TRACK_TO_PAD_CLEARANCE", "Error", [track.id, aComponent.id, a.id], `${track.id} violates clearance to pad ${a.id}.`, "Reroute the track away from the pad.")); }); });
  for (let i = 0; i < allPads.length; i += 1) for (let j = i + 1; j < allPads.length; j += 1) { const a = allPads[i]; const b = allPads[j]; if (!padLayers(a.pad).some(layer => padLayers(b.pad).includes(layer)) || rules.padToPadClearance === undefined) continue; const calculation = padToPadDistanceDetailed(a.pad, b.pad, options); if (calculation.state === "INDETERMINATE" || !Number.isFinite(calculation.distance)) findings.push(result("PCB_GEOMETRY_INDETERMINATE", "Error", [a.component.id, a.pad.id, b.component.id, b.pad.id], `Pad-to-pad clearance could not be verified: ${calculation.reason}.`, "Do not accept the board until the geometry calculation converges.")); else { const state = compareClearance(calculation.distance, rules.padToPadClearance); if (state === "INDETERMINATE") findings.push(result("PCB_GEOMETRY_INDETERMINATE", "Error", [a.component.id, a.pad.id, b.component.id, b.pad.id], "Pad-to-pad clearance is within numerical uncertainty.", "Do not accept the board until the geometry calculation is numerically stable.")); else if (state === "VIOLATION") findings.push(result("PCB_PAD_TO_PAD_CLEARANCE", "Error", [a.component.id, a.pad.id, b.component.id, b.pad.id], `Pads ${a.pad.id} and ${b.pad.id} violate pad-to-pad clearance.`, "Move one pad or use a verified footprint.")); } }
  const viaIds = new Set<string>(); project.vias.forEach(via => { if (viaIds.has(via.id)) findings.push(result("PCB_DUPLICATE_VIA_ID", "Error", [via.id], `Via ID ${via.id} is duplicated.`, "Assign a stable unique via ID.")); viaIds.add(via.id); const diameter = via.diameter ?? via.drill * 2; if (!finite(via.drill) || via.drill <= 0 || !finite(diameter) || diameter <= via.drill) findings.push(result("PCB_INVALID_VIA_GEOMETRY", "Error", [via.id], "Via outer diameter must be finite and greater than drill diameter.", "Set valid via geometry.")); if (rules.minimumDrillDiameter !== undefined && via.drill < rules.minimumDrillDiameter) findings.push(result("PCB_MINIMUM_DRILL_DIAMETER", "Error", [via.id], "Via drill is below the configured minimum.", "Increase the drill diameter.")); if (rules.minimumAnnularRing !== undefined && (diameter - via.drill) / 2 < rules.minimumAnnularRing) findings.push(result("PCB_MINIMUM_ANNULAR_RING", "Error", [via.id], "Via annular ring is below the configured minimum.", "Increase the outer diameter.")); if (!via.layers) findings.push(result("PCB_VIA_LAYER_SPAN_UNAVAILABLE", "Info", [via.id], "Via layer-span data is unavailable; cross-layer connectivity is not assumed.", "Specify verified start and end layers.")); const edge = rules.copperToEdgeClearance ?? board.edgeClearance ?? 0; if (!boardContains({ x: via.x, y: via.y }, board, diameter / 2 + edge)) findings.push(result("PCB_VIA_EDGE_CLEARANCE", "Error", [via.id], "Via geometry violates board-edge clearance.", "Move the via inward.")); allPads.forEach(({ component: padComponent, pad }) => { if (rules.viaToPadClearance === undefined || !padLayers(pad).some(layer => via.layers?.includes(layer))) return; const actual = viaToPadDistance(pad, via); const state = compareClearance(actual, rules.viaToPadClearance); if (state === "INDETERMINATE") findings.push(result("PCB_GEOMETRY_INDETERMINATE", "Error", [padComponent.id, pad.id, via.id], "Via-to-pad clearance is within numerical uncertainty or has a non-finite result.", "Do not accept the board until the geometry calculation is numerically stable.")); else if (state === "VIOLATION") findings.push(result("PCB_VIA_TO_PAD_CLEARANCE", "Error", [padComponent.id, pad.id, via.id], `${via.id} is ${actual.toFixed(6)} units from pad ${pad.id}; ${rules.viaToPadClearance} units is required.`, "Move the via or pad.")); }); project.tracks.forEach(track => { if (!via.layers?.includes(track.layer) || rules.trackToViaClearance === undefined) return; const actual = pointToSegment({ x: via.x, y: via.y }, track.from, track.to); const state = compareClearance(actual, diameter / 2 + track.width / 2 + rules.trackToViaClearance); if (state === "INDETERMINATE") findings.push(result("PCB_GEOMETRY_INDETERMINATE", "Error", [track.id, via.id], "Track-to-via clearance is within numerical uncertainty or has a non-finite result.", "Do not accept the board until the geometry calculation is numerically stable.")); else if (state === "VIOLATION") findings.push(result("PCB_TRACK_TO_VIA_CLEARANCE", "Error", [track.id, via.id], `${track.id} violates clearance to ${via.id}.`, "Reroute the track or move the via.")); }); });
  for (let i = 0; i < project.vias.length; i += 1) for (let j = i + 1; j < project.vias.length; j += 1) { const a = project.vias[i]; const b = project.vias[j]; if (rules.minimumViaClearance === undefined) continue; const actual = distance({ x: a.x, y: a.y }, { x: b.x, y: b.y }); const required = (a.diameter ?? a.drill * 2) / 2 + (b.diameter ?? b.drill * 2) / 2 + rules.minimumViaClearance; const state = compareClearance(actual, required); if (state === "INDETERMINATE") findings.push(result("PCB_GEOMETRY_INDETERMINATE", "Error", [a.id, b.id], "Via-to-via clearance is within numerical uncertainty or has a non-finite result.", "Do not accept the board until the geometry calculation is numerically stable.")); else if (state === "VIOLATION") findings.push(result("PCB_VIA_TO_VIA_CLEARANCE", "Error", [a.id, b.id], "Vias violate via-to-via clearance.", "Move one via.")); }
  return findings;
}

const PCB_PROJECT_ROOT_FIELDS = ["schemaVersion", "projectName", "revision", "updatedAt", "grid", "activeLayer", "components", "wires", "tracks", "vias", "board", "designRules", "junctions"] as const;

function validatePcbRootBoundary(value: unknown): ValidationError[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ path: "$", message: "project must be a non-null object" }];
  }
  const errors: ValidationError[] = [];
  unknownFields(value, PCB_PROJECT_ROOT_FIELDS, "$", errors);
  for (const field of ["components", "wires", "tracks", "vias", "junctions"] as const) {
    const collection = (value as Record<string, unknown>)[field];
    if (Array.isArray(collection)) validateDenseArray(collection, field, errors);
  }
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion;
  if (schemaVersion !== undefined && (
    typeof schemaVersion !== "number" ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 1 ||
    schemaVersion > CURRENT_PROJECT_VERSION
  )) {
    errors.push({ path: "schemaVersion", message: `must be an integer from 1 to ${CURRENT_PROJECT_VERSION}` });
  }
  return errors;
}

/**
 * Public PCB-only compatibility boundary. It accepts only known project-root
 * fields and supported legacy schema versions; model selection is never
 * inferred from arbitrary metadata. The geometry implementation remains V2.
 */
export function validatePcb(
  project: Pick<EngineeringProject, "components" | "tracks" | "vias"> & Partial<Pick<EngineeringProject, "board" | "designRules">>,
  options: GeometryOptions = {},
): DrcResult[] {
  const boundaryErrors = validatePcbRootBoundary(project);
  if (boundaryErrors.length > 0) {
    const first = boundaryErrors[0];
    return [result("PCB_INVALID_INPUT", "Error", [], `PCB input is invalid at ${first.path}.`, first.message)];
  }
  const optionErrors = validateGeometryOptions(options);
  if (optionErrors.length > 0) {
    const first = optionErrors[0];
    return [result("PCB_INVALID_OPTIONS", "Error", [], `PCB geometry options are invalid at ${first.path}.`, first.message)];
  }
  return evaluatePcbV2(project, options);
}

type LegacyDrcSourceVersion = "versionless" | "schema-v1" | "schema-v2";

function resolveLegacyDrcSourceVersion(schemaVersion: unknown): LegacyDrcSourceVersion | null {
  if (schemaVersion === undefined) return "versionless";
  if (schemaVersion === 1) return "schema-v1";
  if (schemaVersion === 2) return "schema-v2";
  return null;
}

export function runDesignRules(project: EngineeringProject) {
  const validation = validateProjectJsonDetailed(project);
  if (!validation.ok) return [result("PROJECT_INVALID", "Error", [], `Project data is invalid at ${validation.errors[0]?.path ?? "$"}.`, validation.errors[0]?.message ?? "Repair the project data before running DRC.")];

  // Resolve only from the persisted version field. All accepted legacy source
  // states intentionally retain the exact same frozen V2 evaluator contract.
  const sourceVersion = resolveLegacyDrcSourceVersion(project.schemaVersion);
  if (sourceVersion === null) {
    return [result("PROJECT_INVALID", "Error", [], "Project data has an unsupported schema version.", "Repair the project data before running DRC.")];
  }

  let pcbFindings: DrcResult[];
  switch (sourceVersion) {
    case "versionless":
    case "schema-v1":
    case "schema-v2":
      pcbFindings = evaluatePcbV2(project);
      break;
    default:
      return [result("PROJECT_INVALID", "Error", [], "Project data has an unsupported schema version.", "Repair the project data before running DRC.")];
  }
  return [...validateSchematic(project), ...pcbFindings];
}

function validateDenseArray(value: unknown, path: string, errors: ValidationError[]): value is unknown[] { if (!Array.isArray(value)) return false; for (let index = 0; index < value.length; index += 1) { if (!Object.prototype.hasOwnProperty.call(value, index)) errors.push({ path: `${path}[${index}]`, message: "must not contain sparse array holes" }); } return true; }
function uniqueIds(items: unknown[], path: string, errors: ValidationError[]) { const seen = new Set<string>(); items.forEach((item, index) => { if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string" || !(item as { id: string }).id) errors.push({ path: `${path}[${index}].id`, message: "must be a non-empty string" }); else if (seen.has((item as { id: string }).id)) errors.push({ path: `${path}[${index}].id`, message: "must be unique" }); else seen.add((item as { id: string }).id); }); }
function validateCoordinates(value: unknown, path: string, errors: ValidationError[]) { if (!validPoint(value)) errors.push({ path, message: "must contain finite numeric x and y" }); }
function unknownFields(value: object, allowed: readonly string[], path: string, errors: ValidationError[]) { const allowedSet = new Set(allowed); Object.keys(value).forEach(key => { if (!allowedSet.has(key)) errors.push({ path: `${path}.${key}`, message: "unknown field" }); }); }
function validateGeometryOptions(value: unknown): ValidationError[] { if (value === undefined) return []; if (!value || typeof value !== "object" || Array.isArray(value)) return [{ path: "options", message: "must be a non-null object" }]; const errors: ValidationError[] = []; unknownFields(value, ["gjkMaxIterations"], "options", errors); if (Object.prototype.hasOwnProperty.call(value, "gjkMaxIterations")) { const iterations = (value as { gjkMaxIterations?: unknown }).gjkMaxIterations; if (typeof iterations !== "number" || !Number.isSafeInteger(iterations) || iterations < 1) errors.push({ path: "options.gjkMaxIterations", message: "must be a positive safe integer" }); } return errors; }
function validatePad(value: unknown, path: string, errors: ValidationError[]) { if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push({ path, message: "must be an object" }); return; } unknownFields(value, ["id", "number", "position", "width", "height", "shape", "layer", "layers", "drill", "plated", "rotation"], path, errors); const pad = value as Partial<Pad>; if (typeof pad.id !== "string" || !pad.id) errors.push({ path: `${path}.id`, message: "must be a non-empty string" }); if (typeof pad.number !== "string" || !pad.number) errors.push({ path: `${path}.number`, message: "must be a non-empty string" }); validateCoordinates(pad.position, `${path}.position`, errors); if (!finite(pad.width) || pad.width <= 0) errors.push({ path: `${path}.width`, message: "must be positive and finite" }); if (!finite(pad.height) || pad.height <= 0) errors.push({ path: `${path}.height`, message: "must be positive and finite" }); if (pad.layer !== "F.Cu" && pad.layer !== "B.Cu") errors.push({ path: `${path}.layer`, message: "must be F.Cu or B.Cu" }); if (pad.layers !== undefined) { if (!Array.isArray(pad.layers)) errors.push({ path: `${path}.layers`, message: "must be a non-empty array of valid copper layers" }); else { validateDenseArray(pad.layers, `${path}.layers`, errors); if (pad.layers.length === 0 || pad.layers.some(layer => layer !== "F.Cu" && layer !== "B.Cu")) errors.push({ path: `${path}.layers`, message: "must be a non-empty array of valid copper layers" }); } } if (pad.shape !== undefined && pad.shape !== "circle" && pad.shape !== "rect" && pad.shape !== "oval") errors.push({ path: `${path}.shape`, message: "must be circle, rect, or oval" }); if (pad.shape === "circle" && finite(pad.width) && pad.width > 0 && finite(pad.height) && pad.height > 0 && pad.width !== pad.height) errors.push({ path: `${path}.height`, message: "Circle pads require equal width and height; Oval pads support independent dimensions" }); if (pad.rotation !== undefined && !finite(pad.rotation)) errors.push({ path: `${path}.rotation`, message: "must be finite" }); if (pad.drill !== undefined && (!finite(pad.drill) || pad.drill <= 0)) errors.push({ path: `${path}.drill`, message: "must be positive and finite" }); if (pad.plated !== undefined && typeof pad.plated !== "boolean") errors.push({ path: `${path}.plated`, message: "must be boolean" }); }

export function validateProjectJsonDetailed(value: unknown): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = []; if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, errors: [{ path: "$", message: "project must be a non-null object" }] };
  unknownFields(value, ["schemaVersion", "projectName", "revision", "updatedAt", "grid", "activeLayer", "components", "wires", "tracks", "vias", "board", "designRules", "junctions"], "$", errors);
  const project = value as Partial<EngineeringProject> & { schemaVersion?: unknown; revision?: unknown; updatedAt?: unknown; activeLayer?: unknown };
  if (project.schemaVersion !== undefined && (!Number.isInteger(project.schemaVersion) || project.schemaVersion < 1 || project.schemaVersion > CURRENT_PROJECT_VERSION)) errors.push({ path: "schemaVersion", message: `must be an integer from 1 to ${CURRENT_PROJECT_VERSION}` }); if (project.projectName !== undefined && typeof project.projectName !== "string") errors.push({ path: "projectName", message: "must be a string" }); if (project.revision !== undefined && (typeof project.revision !== "number" || !Number.isInteger(project.revision) || project.revision < 0)) errors.push({ path: "revision", message: "must be a non-negative integer" }); if (project.updatedAt !== undefined && typeof project.updatedAt !== "string") errors.push({ path: "updatedAt", message: "must be a string" }); if (project.activeLayer !== undefined && project.activeLayer !== "F.Cu" && project.activeLayer !== "B.Cu") errors.push({ path: "activeLayer", message: "must be F.Cu or B.Cu" });
  (["components", "wires", "tracks", "vias"] as const).forEach(field => { if (!Array.isArray(project[field])) errors.push({ path: field, message: "must be an array" }); else validateDenseArray(project[field], field, errors); }); const hasGrid = Object.prototype.hasOwnProperty.call(project, "grid"); if (hasGrid && (!finite(project.grid) || project.grid <= 0)) errors.push({ path: "grid", message: "must be positive and finite" });
  const components = Array.isArray(project.components) ? project.components : []; const wires = Array.isArray(project.wires) ? project.wires : []; const tracks = Array.isArray(project.tracks) ? project.tracks : []; const vias = Array.isArray(project.vias) ? project.vias : [];
  uniqueIds(components, "components", errors); uniqueIds(wires, "wires", errors); uniqueIds(tracks, "tracks", errors); uniqueIds(vias, "vias", errors);
  components.forEach((item, index) => { const path = `components[${index}]`; const component = item as Partial<EngineeringComponent> & { value?: unknown; footprint?: unknown; manufacturer?: unknown; partNumber?: unknown; kind?: unknown } | null; if (!component || typeof component !== "object" || Array.isArray(component)) { errors.push({ path, message: "must be an object" }); return; } unknownFields(component, ["id", "ref", "value", "footprint", "manufacturer", "partNumber", "kind", "x", "y", "rotation", "layer", "pins", "footprintGeometry"], path, errors); if (typeof component.id !== "string" || !component.id) errors.push({ path: `${path}.id`, message: "must be a non-empty string" }); if (typeof component.ref !== "string" || !component.ref) errors.push({ path: `${path}.ref`, message: "must be a non-empty string" }); validateCoordinates(component, path, errors); if (component.rotation !== undefined && !finite(component.rotation)) errors.push({ path: `${path}.rotation`, message: "must be finite" }); if (component.layer !== undefined && component.layer !== "F.Cu" && component.layer !== "B.Cu") errors.push({ path: `${path}.layer`, message: "must be F.Cu or B.Cu" }); for (const field of ["value", "footprint", "manufacturer", "partNumber", "kind"] as const) if (component[field] !== undefined && typeof component[field] !== "string") errors.push({ path: `${path}.${field}`, message: "must be a string" }); if (component.pins !== undefined) { if (!Array.isArray(component.pins)) errors.push({ path: `${path}.pins`, message: "must be an array" }); else { validateDenseArray(component.pins, `${path}.pins`, errors); uniqueIds(component.pins, `${path}.pins`, errors); component.pins.forEach((pin, pinIndex) => { const pinPath = `${path}.pins[${pinIndex}]`; if (!pin || typeof pin !== "object" || Array.isArray(pin)) { errors.push({ path: pinPath, message: "must be an object" }); return; } unknownFields(pin, ["id", "number", "name", "position", "required", "electricalType"], pinPath, errors); const typed = pin as Partial<Pin>; if (typeof typed.id !== "string" || !typed.id) errors.push({ path: `${pinPath}.id`, message: "must be a non-empty string" }); if (typeof typed.number !== "string" || !typed.number) errors.push({ path: `${pinPath}.number`, message: "must be a non-empty string" }); if (typeof typed.name !== "string" || !typed.name) errors.push({ path: `${pinPath}.name`, message: "must be a non-empty string" }); validateCoordinates(typed.position, `${pinPath}.position`, errors); if (typed.required !== undefined && typeof typed.required !== "boolean") errors.push({ path: `${pinPath}.required`, message: "must be boolean" }); if (typed.electricalType !== undefined && typeof typed.electricalType !== "string") errors.push({ path: `${pinPath}.electricalType`, message: "must be a string" }); }); } } if (component.footprintGeometry !== undefined) { const geometry = component.footprintGeometry; const geometryPath = `${path}.footprintGeometry`; if (!geometry || typeof geometry !== "object" || Array.isArray(geometry)) errors.push({ path: geometryPath, message: "must be an object" }); else { unknownFields(geometry, ["identifier", "pads", "courtyard"], geometryPath, errors); if (typeof geometry.identifier !== "string" || !geometry.identifier) errors.push({ path: `${geometryPath}.identifier`, message: "must be a non-empty string" }); if (!Array.isArray(geometry.pads)) errors.push({ path: `${geometryPath}.pads`, message: "must be an array" }); else { validateDenseArray(geometry.pads, `${geometryPath}.pads`, errors); uniqueIds(geometry.pads, `${geometryPath}.pads`, errors); geometry.pads.forEach((pad, padIndex) => validatePad(pad, `${geometryPath}.pads[${padIndex}]`, errors)); } if (geometry.courtyard !== undefined) { const courtyard = geometry.courtyard; const courtyardPath = `${geometryPath}.courtyard`; if (!courtyard || typeof courtyard !== "object" || Array.isArray(courtyard)) errors.push({ path: courtyardPath, message: "must be an object" }); else { unknownFields(courtyard, ["width", "height"], courtyardPath, errors); if (!finite(courtyard.width) || courtyard.width <= 0) errors.push({ path: `${courtyardPath}.width`, message: "must be positive and finite" }); if (!finite(courtyard.height) || courtyard.height <= 0) errors.push({ path: `${courtyardPath}.height`, message: "must be positive and finite" }); } } } } });
  wires.forEach((wire, index) => { const path = `wires[${index}]`; if (!wire || typeof wire !== "object" || Array.isArray(wire)) { errors.push({ path, message: "must be an object" }); return; } unknownFields(wire, ["id", "from", "to", "net", "junction"], path, errors); const typed = wire as Partial<EngineeringWire>; if (typeof typed.id !== "string" || !typed.id) errors.push({ path: `${path}.id`, message: "must be a non-empty string" }); validateCoordinates(typed.from, `${path}.from`, errors); validateCoordinates(typed.to, `${path}.to`, errors); if (typed.net !== undefined && typeof typed.net !== "string") errors.push({ path: `${path}.net`, message: "must be a string" }); if (typed.junction !== undefined && typeof typed.junction !== "boolean") errors.push({ path: `${path}.junction`, message: "must be boolean" }); });
  tracks.forEach((track, index) => { const path = `tracks[${index}]`; if (!track || typeof track !== "object" || Array.isArray(track)) { errors.push({ path, message: "must be an object" }); return; } unknownFields(track, ["id", "from", "to", "width", "layer", "net"], path, errors); const typed = track as Partial<EngineeringTrack>; if (typeof typed.id !== "string" || !typed.id) errors.push({ path: `${path}.id`, message: "must be a non-empty string" }); validateCoordinates(typed.from, `${path}.from`, errors); validateCoordinates(typed.to, `${path}.to`, errors); if (!finite(typed.width) || (typed.width ?? 0) <= 0) errors.push({ path: `${path}.width`, message: "must be positive and finite" }); if (typed.layer !== "F.Cu" && typed.layer !== "B.Cu") errors.push({ path: `${path}.layer`, message: "must be F.Cu or B.Cu" }); if (typed.net !== undefined && typeof typed.net !== "string") errors.push({ path: `${path}.net`, message: "must be a string" }); });
  vias.forEach((via, index) => { const path = `vias[${index}]`; if (!via || typeof via !== "object" || Array.isArray(via)) { errors.push({ path, message: "must be an object" }); return; } unknownFields(via, ["id", "x", "y", "drill", "diameter", "layers"], path, errors); const typed = via as Partial<EngineeringVia>; if (typeof typed.id !== "string" || !typed.id) errors.push({ path: `${path}.id`, message: "must be a non-empty string" }); validateCoordinates(typed, path, errors); if (!finite(typed.drill) || (typed.drill ?? 0) <= 0) errors.push({ path: `${path}.drill`, message: "must be positive and finite" }); if (typed.diameter !== undefined && (!finite(typed.diameter) || typed.diameter <= typed.drill!)) errors.push({ path: `${path}.diameter`, message: "must be greater than drill" }); if (typed.layers !== undefined) { if (!Array.isArray(typed.layers)) errors.push({ path: `${path}.layers`, message: "must contain exactly two distinct valid copper layers" }); else { validateDenseArray(typed.layers, `${path}.layers`, errors); if (typed.layers.length !== 2 || new Set(typed.layers).size !== 2 || typed.layers.some(layer => layer !== "F.Cu" && layer !== "B.Cu")) errors.push({ path: `${path}.layers`, message: "must contain exactly two distinct valid copper layers" }); } } });
  if (project.board !== undefined) { const board = project.board; if (!board || typeof board !== "object" || Array.isArray(board)) errors.push({ path: "board", message: "must be an object" }); else { unknownFields(board, ["x", "y", "width", "height", "edgeClearance"], "board", errors); if (!finite(board.x) || !finite(board.y)) errors.push({ path: "board", message: "must have finite origin" }); if (!finite(board.width) || board.width <= 0) errors.push({ path: "board.width", message: "must be positive and finite" }); if (!finite(board.height) || board.height <= 0) errors.push({ path: "board.height", message: "must be positive and finite" }); if (board.edgeClearance !== undefined && (!finite(board.edgeClearance) || board.edgeClearance < 0)) errors.push({ path: "board.edgeClearance", message: "must be finite and non-negative" }); } }
  if (project.junctions !== undefined) { if (!Array.isArray(project.junctions)) errors.push({ path: "junctions", message: "must be an array" }); else { validateDenseArray(project.junctions, "junctions", errors); project.junctions.forEach((junction, index) => { const path = `junctions[${index}]`; if (!junction || typeof junction !== "object" || Array.isArray(junction)) errors.push({ path, message: "must be an object" }); else { unknownFields(junction, ["x", "y"], path, errors); validateCoordinates(junction, path, errors); } }); } }
  if (project.designRules !== undefined) { const allowedRules = ["minimumTrackClearance", "copperToEdgeClearance", "minimumTrackWidth", "trackToViaClearance", "viaToPadClearance", "minimumViaClearance", "trackToPadClearance", "padToPadClearance", "minimumDrillDiameter", "minimumAnnularRing"] as const; if (!project.designRules || typeof project.designRules !== "object" || Array.isArray(project.designRules)) errors.push({ path: "designRules", message: "must be an object" }); else { unknownFields(project.designRules, allowedRules, "designRules", errors); Object.entries(project.designRules).forEach(([key, rule]) => { if (!finite(rule) || rule < 0) errors.push({ path: `designRules.${key}`, message: "must be finite and non-negative" }); }); } }
  return { ok: errors.length === 0, errors };
}

export function migrateProjectJson(value: unknown): EngineeringProject | null { if (!value || typeof value !== "object" || Array.isArray(value)) return null; const source = value as Record<string, unknown>; const rawVersion = source.schemaVersion; const version = rawVersion === undefined ? 1 : typeof rawVersion === "number" ? rawVersion : NaN; if (!Number.isInteger(version) || version > CURRENT_PROJECT_VERSION || version < 1) return null; const has = (key: string) => Object.prototype.hasOwnProperty.call(source, key); const migrated: unknown = { ...source, schemaVersion: CURRENT_PROJECT_VERSION, grid: has("grid") ? source.grid : 20, wires: has("wires") ? source.wires : [], tracks: has("tracks") ? source.tracks : [], vias: has("vias") ? source.vias : [], components: has("components") ? source.components : [] }; return validateProjectJsonDetailed(migrated).ok ? migrated as EngineeringProject : null; }
export function validateProjectJson(value: unknown): value is EngineeringProject { return validateProjectJsonDetailed(value).ok; }
