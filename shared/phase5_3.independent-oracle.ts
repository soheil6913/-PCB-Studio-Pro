/*
 * Test-only reference geometry for Phase 5.3.
 * This module deliberately imports no production geometry or transform helpers.
 * Coordinates are caller-supplied integer ticks for exact rational predicates;
 * approximate ellipse routines return explicit Lipschitz error intervals.
 */

export type TickPoint = { x: bigint; y: bigint };
export type ExactSquaredDistance = { numerator: bigint; denominator: bigint };
export type FloatPoint = { x: number; y: number };
export type DistanceInterval = {
  lower: number;
  upper: number;
  errorBound: number;
  method: string;
};

export function tickPoint(x: number | bigint, y: number | bigint): TickPoint {
  return { x: BigInt(x), y: BigInt(y) };
}

function squaredIntegerDistance(
  a: TickPoint,
  b: TickPoint
): ExactSquaredDistance {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return { numerator: dx * dx + dy * dy, denominator: 1n };
}

function compareFractions(
  a: ExactSquaredDistance,
  b: ExactSquaredDistance
): number {
  const lhs = a.numerator * b.denominator;
  const rhs = b.numerator * a.denominator;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

export function compareSquaredDistanceToLengthSquared(
  distanceSquared: ExactSquaredDistance,
  length: bigint
): number {
  if (length < 0n) throw new RangeError("length must be non-negative");
  return compareFractions(distanceSquared, {
    numerator: length * length,
    denominator: 1n,
  });
}

export function squaredDistanceApprox(value: ExactSquaredDistance): number {
  return Number(value.numerator) / Number(value.denominator);
}

export function distanceApprox(value: ExactSquaredDistance): number {
  return Math.sqrt(squaredDistanceApprox(value));
}

function cross(a: TickPoint, b: TickPoint, c: TickPoint): bigint {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function between(value: bigint, first: bigint, second: bigint): boolean {
  return (
    value >= (first < second ? first : second) &&
    value <= (first > second ? first : second)
  );
}

function onSegment(a: TickPoint, b: TickPoint, p: TickPoint): boolean {
  return (
    cross(a, b, p) === 0n && between(p.x, a.x, b.x) && between(p.y, a.y, b.y)
  );
}

export function segmentsIntersectExact(
  a: TickPoint,
  b: TickPoint,
  c: TickPoint,
  d: TickPoint
): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (abC === 0n && onSegment(a, b, c)) return true;
  if (abD === 0n && onSegment(a, b, d)) return true;
  if (cdA === 0n && onSegment(c, d, a)) return true;
  if (cdB === 0n && onSegment(c, d, b)) return true;
  return abC < 0n !== abD < 0n && cdA < 0n !== cdB < 0n;
}

export function pointSegmentDistanceSquaredExact(
  point: TickPoint,
  start: TickPoint,
  end: TickPoint
): ExactSquaredDistance {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared === 0n) return squaredIntegerDistance(point, start);
  const px = point.x - start.x;
  const py = point.y - start.y;
  const projection = px * vx + py * vy;
  if (projection <= 0n) return squaredIntegerDistance(point, start);
  if (projection >= lengthSquared) return squaredIntegerDistance(point, end);
  const area = vx * py - vy * px;
  return { numerator: area * area, denominator: lengthSquared };
}

export function segmentDistanceSquaredExact(
  a: TickPoint,
  b: TickPoint,
  c: TickPoint,
  d: TickPoint
): ExactSquaredDistance {
  if (segmentsIntersectExact(a, b, c, d))
    return { numerator: 0n, denominator: 1n };
  const candidates = [
    pointSegmentDistanceSquaredExact(a, c, d),
    pointSegmentDistanceSquaredExact(b, c, d),
    pointSegmentDistanceSquaredExact(c, a, b),
    pointSegmentDistanceSquaredExact(d, a, b),
  ];
  return candidates.reduce((best, candidate) =>
    compareFractions(candidate, best) < 0 ? candidate : best
  );
}

export function pointAxisAlignedBoxDistanceSquaredExact(
  point: TickPoint,
  left: bigint,
  top: bigint,
  right: bigint,
  bottom: bigint
): ExactSquaredDistance {
  const dx =
    point.x < left ? left - point.x : point.x > right ? point.x - right : 0n;
  const dy =
    point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0n;
  return { numerator: dx * dx + dy * dy, denominator: 1n };
}

export function segmentAxisAlignedBoxDistanceSquaredExact(
  start: TickPoint,
  end: TickPoint,
  left: bigint,
  top: bigint,
  right: bigint,
  bottom: bigint
): ExactSquaredDistance {
  const inside = (p: TickPoint) =>
    p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (inside(start) || inside(end)) return { numerator: 0n, denominator: 1n };
  const corners = [
    tickPoint(left, top),
    tickPoint(right, top),
    tickPoint(right, bottom),
    tickPoint(left, bottom),
  ];
  let best: ExactSquaredDistance | undefined;
  for (let i = 0; i < 4; i += 1) {
    const c = corners[i]!;
    const d = corners[(i + 1) % 4]!;
    if (segmentsIntersectExact(start, end, c, d))
      return { numerator: 0n, denominator: 1n };
    const candidate = segmentDistanceSquaredExact(start, end, c, d);
    if (!best || compareFractions(candidate, best) < 0) best = candidate;
  }
  return best ?? { numerator: 0n, denominator: 1n };
}

export function rotatePointIndependent(
  point: FloatPoint,
  degrees: number
): FloatPoint {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function localPoint(
  point: FloatPoint,
  center: FloatPoint,
  rotationDegrees: number
): FloatPoint {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: dx * cosine + dy * sine, y: -dx * sine + dy * cosine };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function pointSegmentDistance(
  point: FloatPoint,
  start: FloatPoint,
  end: FloatPoint
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const squaredLength = dx * dx + dy * dy;
  if (squaredLength === 0)
    return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / squaredLength,
    0,
    1
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function segmentCrossesEllipse(
  start: FloatPoint,
  end: FloatPoint,
  rx: number,
  ry: number
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const ax = start.x / rx;
  const ay = start.y / ry;
  const vx = dx / rx;
  const vy = dy / ry;
  const a = vx * vx + vy * vy;
  if (a === 0) return ax * ax + ay * ay <= 1;
  const t = clamp(-(ax * vx + ay * vy) / a, 0, 1);
  const x = ax + t * vx;
  const y = ay + t * vy;
  return x * x + y * y <= 1;
}

/**
 * Approximate distance from a closed segment to a filled rotated ellipse.
 * A uniform boundary-angle mesh gives an upper witness. Distance-to-segment is
 * 1-Lipschitz, and ellipse arc speed is at most max(rx,ry), so the true minimum
 * is in [upper - maxRadius*pi/N, upper]. A separate normalized quadratic check
 * returns exact zero for fixtures whose segment crosses the filled ellipse.
 */
export function segmentEllipseDistanceInterval(
  startWorld: FloatPoint,
  endWorld: FloatPoint,
  center: FloatPoint,
  rx: number,
  ry: number,
  rotationDegrees = 0,
  samples = 131072
): DistanceInterval {
  if (!(rx > 0) || !(ry > 0) || !Number.isInteger(samples) || samples < 16)
    throw new RangeError("ellipse radii and mesh size must be positive");
  const start = localPoint(startWorld, center, rotationDegrees);
  const end = localPoint(endWorld, center, rotationDegrees);
  if (segmentCrossesEllipse(start, end, rx, ry))
    return {
      lower: 0,
      upper: 0,
      errorBound: 0,
      method: "quadratic segment/ellipse intersection",
    };
  const maxRadius = Math.max(rx, ry);
  let upper = Number.POSITIVE_INFINITY;
  for (let i = 0; i < samples; i += 1) {
    const angle = (2 * Math.PI * i) / samples;
    const boundary = { x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
    upper = Math.min(upper, pointSegmentDistance(boundary, start, end));
  }
  const errorBound = (maxRadius * Math.PI) / samples;
  return {
    lower: Math.max(0, upper - errorBound),
    upper,
    errorBound,
    method: `uniform ellipse-boundary mesh; Lipschitz arc bound; N=${samples}`,
  };
}

/**
 * Approximate distance from a point outside a filled rotated ellipse to its
 * boundary. Point-to-set distance is 1-Lipschitz in the ellipse angle; therefore
 * a nearest mesh sample is at most maxRadius*pi/N farther than the true minimum.
 * The interval is widened by that explicit discretization bound.
 */
export function pointEllipseDistanceInterval(
  pointWorld: FloatPoint,
  center: FloatPoint,
  rx: number,
  ry: number,
  rotationDegrees = 0,
  samples = 131072
): DistanceInterval {
  if (!(rx > 0) || !(ry > 0) || !Number.isInteger(samples) || samples < 16)
    throw new RangeError("ellipse radii and mesh size must be positive");
  const point = localPoint(pointWorld, center, rotationDegrees);
  const normalized = (point.x / rx) ** 2 + (point.y / ry) ** 2;
  if (normalized <= 1)
    return {
      lower: 0,
      upper: 0,
      errorBound: 0,
      method: "point inside filled ellipse",
    };
  let upper = Number.POSITIVE_INFINITY;
  for (let i = 0; i < samples; i += 1) {
    const angle = (2 * Math.PI * i) / samples;
    const dx = rx * Math.cos(angle) - point.x;
    const dy = ry * Math.sin(angle) - point.y;
    upper = Math.min(upper, Math.hypot(dx, dy));
  }
  const errorBound = (Math.max(rx, ry) * Math.PI) / samples;
  return {
    lower: Math.max(0, upper - errorBound),
    upper,
    errorBound,
    method: `uniform ellipse-boundary mesh; Lipschitz arc bound; N=${samples}`,
  };
}

/**
 * Distance interval for a disjoint rotated ellipse and axis-aligned rectangle.
 * Each boundary mesh point is measured to the filled rectangle. Since distance
 * to a closed set is 1-Lipschitz and ellipse arc speed is at most max(rx,ry),
 * the minimum lies no farther than maxRadius*pi/N below the best witness.
 * This routine is intended for fixtures independently established to be
 * disjoint; overlap is checked separately in the test fixture construction.
 */
export function ellipseRectangleDistanceInterval(
  center: FloatPoint,
  rx: number,
  ry: number,
  rotationDegrees: number,
  rectangle: { left: number; top: number; right: number; bottom: number },
  samples = 131072
): DistanceInterval {
  if (!(rx > 0) || !(ry > 0) || !Number.isInteger(samples) || samples < 16)
    throw new RangeError("ellipse radii and mesh size must be positive");
  let upper = Number.POSITIVE_INFINITY;
  for (let i = 0; i < samples; i += 1) {
    const angle = (2 * Math.PI * i) / samples;
    const local = { x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
    const rotated = rotatePointIndependent(local, rotationDegrees);
    const x = center.x + rotated.x;
    const y = center.y + rotated.y;
    const dx =
      x < rectangle.left
        ? rectangle.left - x
        : x > rectangle.right
          ? x - rectangle.right
          : 0;
    const dy =
      y < rectangle.top
        ? rectangle.top - y
        : y > rectangle.bottom
          ? y - rectangle.bottom
          : 0;
    upper = Math.min(upper, Math.hypot(dx, dy));
  }
  const errorBound = (Math.max(rx, ry) * Math.PI) / samples;
  return {
    lower: Math.max(0, upper - errorBound),
    upper,
    errorBound,
    method: `rotated ellipse boundary to rectangle distance mesh; Lipschitz arc bound; N=${samples}`,
  };
}

export function classifyDistanceInterval(
  interval: DistanceInterval,
  required: number,
  toleranceScale = Math.max(
    Math.abs(interval.upper),
    Math.abs(required),
    Number.MIN_VALUE
  )
): "CLEAR" | "VIOLATION" | "AMBIGUOUS" {
  if (interval.lower >= required) return "CLEAR";
  const uncertainty = Number.EPSILON * toleranceScale * 16;
  if (interval.upper < required - uncertainty) return "VIOLATION";
  return "AMBIGUOUS";
}

const DEFAULT_RECTANGLE_ORACLE_SCALE = 1_000_000_000;

export function quantizePointIndependent(
  point: FloatPoint,
  unitsPerWorldUnit = DEFAULT_RECTANGLE_ORACLE_SCALE
): TickPoint {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isSafeInteger(unitsPerWorldUnit) ||
    unitsPerWorldUnit <= 0
  )
    throw new RangeError(
      "point coordinates must be finite and quantization scale positive"
    );
  const roundedX = Math.round(point.x * unitsPerWorldUnit);
  const roundedY = Math.round(point.y * unitsPerWorldUnit);
  if (!Number.isSafeInteger(roundedX) || !Number.isSafeInteger(roundedY))
    throw new RangeError("point exceeds the exact fixed-grid integer range");
  return {
    x: BigInt(roundedX),
    y: BigInt(roundedY),
  };
}

export function rotatedRectangleCornersFixed(
  center: FloatPoint,
  width: number,
  height: number,
  rotationDegrees: number,
  unitsPerWorldUnit = DEFAULT_RECTANGLE_ORACLE_SCALE
): TickPoint[] {
  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(rotationDegrees)
  )
    throw new RangeError("rectangle geometry must be finite and positive");
  const localCorners = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];
  return localCorners.map(local => {
    const rotated = rotatePointIndependent(local, rotationDegrees);
    return quantizePointIndependent(
      { x: center.x + rotated.x, y: center.y + rotated.y },
      unitsPerWorldUnit
    );
  });
}

function pointInConvexPolygonExact(point: TickPoint, polygon: TickPoint[]) {
  if (polygon.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const first = polygon[i]!;
    const second = polygon[(i + 1) % polygon.length]!;
    const side = cross(first, second, point);
    if (
      side === 0n &&
      between(point.x, first.x, second.x) &&
      between(point.y, first.y, second.y)
    )
      return true;
    if (side === 0n) continue;
    const currentSign = side > 0n ? 1 : -1;
    if (sign !== 0 && sign !== currentSign) return false;
    sign = currentSign;
  }
  return sign !== 0;
}

export function pointToConvexPolygonDistanceSquaredExact(
  point: TickPoint,
  polygon: TickPoint[]
): ExactSquaredDistance {
  if (polygon.length < 3)
    throw new RangeError("polygon must have at least three vertices");
  if (pointInConvexPolygonExact(point, polygon))
    return { numerator: 0n, denominator: 1n };
  const distances = polygon.map((first, i) =>
    pointSegmentDistanceSquaredExact(
      point,
      first,
      polygon[(i + 1) % polygon.length]!
    )
  );
  return distances.reduce((best, candidate) =>
    compareFractions(candidate, best) < 0 ? candidate : best
  );
}

export function segmentToConvexPolygonDistanceSquaredExact(
  start: TickPoint,
  end: TickPoint,
  polygon: TickPoint[]
): ExactSquaredDistance {
  if (polygon.length < 3)
    throw new RangeError("polygon must have at least three vertices");
  if (
    pointInConvexPolygonExact(start, polygon) ||
    pointInConvexPolygonExact(end, polygon)
  )
    return { numerator: 0n, denominator: 1n };
  let best: ExactSquaredDistance | undefined;
  for (let i = 0; i < polygon.length; i += 1) {
    const first = polygon[i]!;
    const second = polygon[(i + 1) % polygon.length]!;
    if (segmentsIntersectExact(start, end, first, second))
      return { numerator: 0n, denominator: 1n };
    const candidate = segmentDistanceSquaredExact(start, end, first, second);
    if (!best || compareFractions(candidate, best) < 0) best = candidate;
  }
  return best ?? { numerator: 0n, denominator: 1n };
}

function boundedFixedDistanceInterval(
  squared: ExactSquaredDistance,
  unitsPerWorldUnit: number,
  coordinateScale: number,
  method: string
): DistanceInterval {
  const estimate = distanceApprox(squared) / unitsPerWorldUnit;
  const errorBound =
    2 / unitsPerWorldUnit +
    Number.EPSILON * Math.max(1, coordinateScale, estimate) * 128;
  return {
    lower: Math.max(0, estimate - errorBound),
    upper: estimate + errorBound,
    errorBound,
    method,
  };
}

export function pointToRotatedRectangleDistanceInterval(
  point: FloatPoint,
  center: FloatPoint,
  width: number,
  height: number,
  rotationDegrees: number,
  unitsPerWorldUnit = DEFAULT_RECTANGLE_ORACLE_SCALE
): DistanceInterval {
  const corners = rotatedRectangleCornersFixed(
    center,
    width,
    height,
    rotationDegrees,
    unitsPerWorldUnit
  );
  const fixedPoint = quantizePointIndependent(point, unitsPerWorldUnit);
  const squared = pointToConvexPolygonDistanceSquaredExact(fixedPoint, corners);
  const scale = Math.max(
    Math.abs(point.x),
    Math.abs(point.y),
    Math.abs(center.x) + width + height,
    Math.abs(center.y) + width + height,
    width,
    height
  );
  return boundedFixedDistanceInterval(
    squared,
    unitsPerWorldUnit,
    scale,
    "independently transformed rectangle corners; exact BigInt point/polygon distance; fixed-grid and binary64 error envelope"
  );
}

export function segmentToRotatedRectangleDistanceInterval(
  start: FloatPoint,
  end: FloatPoint,
  center: FloatPoint,
  width: number,
  height: number,
  rotationDegrees: number,
  unitsPerWorldUnit = DEFAULT_RECTANGLE_ORACLE_SCALE
): DistanceInterval {
  const corners = rotatedRectangleCornersFixed(
    center,
    width,
    height,
    rotationDegrees,
    unitsPerWorldUnit
  );
  const fixedStart = quantizePointIndependent(start, unitsPerWorldUnit);
  const fixedEnd = quantizePointIndependent(end, unitsPerWorldUnit);
  const squared = segmentToConvexPolygonDistanceSquaredExact(
    fixedStart,
    fixedEnd,
    corners
  );
  const scale = Math.max(
    Math.abs(start.x),
    Math.abs(start.y),
    Math.abs(end.x),
    Math.abs(end.y),
    Math.abs(center.x) + width + height,
    Math.abs(center.y) + width + height,
    width,
    height
  );
  return boundedFixedDistanceInterval(
    squared,
    unitsPerWorldUnit,
    scale,
    "independently transformed rectangle corners; exact BigInt segment/polygon distance; fixed-grid and binary64 error envelope"
  );
}
