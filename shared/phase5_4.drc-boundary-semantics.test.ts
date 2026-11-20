import { describe, expect, it } from "vitest";
import {
  runDesignRules,
  validatePcb,
  validateProjectJsonDetailed,
  type DesignRules,
  type EngineeringComponent,
  type EngineeringProject,
  type EngineeringTrack,
  type EngineeringVia,
  type Layer,
} from "./engineering";
import {
  classifyDistanceInterval,
  compareSquaredDistanceToLengthSquared,
  pointAxisAlignedBoxDistanceSquaredExact,
  pointSegmentDistanceSquaredExact,
  pointToRotatedRectangleDistanceInterval,
  rotatePointIndependent,
  segmentAxisAlignedBoxDistanceSquaredExact,
  segmentDistanceSquaredExact,
  segmentToRotatedRectangleDistanceInterval,
  tickPoint,
  type DistanceInterval,
  type ExactSquaredDistance,
  type FloatPoint,
} from "./phase5_3.independent-oracle";

const TICKS = 1_000;
const unit = (ticks: number) => ticks / TICKS;
const point = (x: number, y: number) => ({ x: unit(x), y: unit(y) });
type TickPoint = { x: number; y: number };
type Outcome = "CLEAR" | "VIOLATION" | "AMBIGUOUS";
type Finding = { ruleId: string; severity: string; objectIds: string[] };

const zeroRules: DesignRules = {
  minimumTrackClearance: 0,
  copperToEdgeClearance: 0,
  minimumTrackWidth: 0,
  trackToViaClearance: 0,
  viaToPadClearance: 0,
  minimumViaClearance: 0,
  trackToPadClearance: 0,
  padToPadClearance: 0,
  minimumDrillDiameter: 0,
  minimumAnnularRing: 0,
};
const farBoard = { x: -50, y: -50, width: 100, height: 100, edgeClearance: 0 };

function doubled(p: TickPoint) {
  return tickPoint(2 * p.x, 2 * p.y);
}

function exactOutcome(
  squared: ExactSquaredDistance,
  requiredTwiceTicks: number
): Outcome {
  return compareSquaredDistanceToLengthSquared(
    squared,
    BigInt(requiredTwiceTicks)
  ) >= 0
    ? "CLEAR"
    : "VIOLATION";
}

function exactTrackTrackOracle(
  a: { from: TickPoint; to: TickPoint; width: number },
  b: { from: TickPoint; to: TickPoint; width: number },
  clearance: number
): Outcome {
  const squared = segmentDistanceSquaredExact(
    doubled(a.from),
    doubled(a.to),
    doubled(b.from),
    doubled(b.to)
  );
  return exactOutcome(squared, a.width + b.width + 2 * clearance);
}

function exactTrackViaOracle(
  track: { from: TickPoint; to: TickPoint; width: number },
  via: { center: TickPoint; diameter: number },
  clearance: number
): Outcome {
  const squared = pointSegmentDistanceSquaredExact(
    doubled(via.center),
    doubled(track.from),
    doubled(track.to)
  );
  return exactOutcome(squared, via.diameter + track.width + 2 * clearance);
}

function exactTrackCircleOracle(
  track: { from: TickPoint; to: TickPoint; width: number },
  circle: { center: TickPoint; diameter: number },
  clearance: number
): Outcome {
  const squared = pointSegmentDistanceSquaredExact(
    doubled(circle.center),
    doubled(track.from),
    doubled(track.to)
  );
  return exactOutcome(squared, track.width + circle.diameter + 2 * clearance);
}

function exactTrackRectOracle(
  track: { from: TickPoint; to: TickPoint; width: number },
  rect: { center: TickPoint; width: number; height: number },
  clearance: number
): Outcome {
  const center = doubled(rect.center);
  const halfWidth = BigInt(rect.width);
  const halfHeight = BigInt(rect.height);
  const squared = segmentAxisAlignedBoxDistanceSquaredExact(
    doubled(track.from),
    doubled(track.to),
    center.x - halfWidth,
    center.y - halfHeight,
    center.x + halfWidth,
    center.y + halfHeight
  );
  return exactOutcome(squared, track.width + 2 * clearance);
}

function exactViaViaOracle(
  a: { center: TickPoint; diameter: number },
  b: { center: TickPoint; diameter: number },
  clearance: number
): Outcome {
  const squared = pointSegmentDistanceSquaredExact(
    doubled(a.center),
    doubled(b.center),
    doubled(b.center)
  );
  return exactOutcome(squared, a.diameter + b.diameter + 2 * clearance);
}

function exactViaCircleOracle(
  via: { center: TickPoint; diameter: number },
  circle: { center: TickPoint; diameter: number },
  clearance: number
): Outcome {
  const squared = pointSegmentDistanceSquaredExact(
    doubled(via.center),
    doubled(circle.center),
    doubled(circle.center)
  );
  return exactOutcome(squared, via.diameter + circle.diameter + 2 * clearance);
}

function exactViaRectOracle(
  via: { center: TickPoint; diameter: number },
  rect: { center: TickPoint; width: number; height: number },
  clearance: number
): Outcome {
  const center = doubled(rect.center);
  const halfWidth = BigInt(rect.width);
  const halfHeight = BigInt(rect.height);
  const squared = pointAxisAlignedBoxDistanceSquaredExact(
    doubled(via.center),
    center.x - halfWidth,
    center.y - halfHeight,
    center.x + halfWidth,
    center.y + halfHeight
  );
  return exactOutcome(squared, via.diameter + 2 * clearance);
}

function exactCircleCircleOracle(
  a: { center: TickPoint; diameter: number },
  b: { center: TickPoint; diameter: number },
  clearance: number
): Outcome {
  const squared = pointSegmentDistanceSquaredExact(
    doubled(a.center),
    doubled(b.center),
    doubled(b.center)
  );
  return exactOutcome(squared, a.diameter + b.diameter + 2 * clearance);
}

function exactRectRectOracle(
  a: { center: TickPoint; width: number; height: number },
  b: { center: TickPoint; width: number; height: number },
  clearance: number
): Outcome {
  const gapX = Math.max(
    0,
    2 * Math.abs(a.center.x - b.center.x) - a.width - b.width
  );
  const gapY = Math.max(
    0,
    2 * Math.abs(a.center.y - b.center.y) - a.height - b.height
  );
  const squared = {
    numerator: BigInt(gapX) ** 2n + BigInt(gapY) ** 2n,
    denominator: 1n,
  };
  return exactOutcome(squared, 2 * clearance);
}

function track(
  id: string,
  from: TickPoint,
  to: TickPoint,
  width: number,
  layer: Layer = "F.Cu",
  net?: string
): EngineeringTrack {
  return {
    id,
    from: point(from.x, from.y),
    to: point(to.x, to.y),
    width: unit(width),
    layer,
    ...(net === undefined ? {} : { net }),
  };
}

function via(
  id: string,
  center: TickPoint,
  diameter: number,
  layers: [Layer, Layer] | null = ["F.Cu", "B.Cu"]
): EngineeringVia {
  return {
    id,
    x: unit(center.x),
    y: unit(center.y),
    drill: unit(Math.min(200, Math.floor(diameter / 2))),
    diameter: unit(diameter),
    ...(layers === null ? {} : { layers }),
  };
}

type PadSpec = {
  width: number;
  height: number;
  shape: "circle" | "rect" | "oval";
  layer?: Layer;
  layers?: Layer[];
  padRotation?: number;
  componentRotation?: number;
  plated?: boolean;
  drill?: number;
};

function padComponent(
  id: string,
  center: TickPoint,
  spec: PadSpec
): EngineeringComponent {
  const pad = {
    id: `${id}-P1`,
    number: "1",
    position: { x: 0, y: 0 },
    width: unit(spec.width),
    height: unit(spec.height),
    shape: spec.shape,
    layer: spec.layer ?? "F.Cu",
    rotation: spec.padRotation ?? 0,
    ...(spec.layers === undefined ? {} : { layers: spec.layers }),
    ...(spec.plated === undefined ? {} : { plated: spec.plated }),
    ...(spec.drill === undefined ? {} : { drill: unit(spec.drill) }),
  };
  return {
    id,
    ref: id,
    x: unit(center.x),
    y: unit(center.y),
    rotation: spec.componentRotation ?? 0,
    footprintGeometry: { identifier: `FP-${id}`, pads: [pad] },
  };
}

function project(
  options: {
    tracks?: EngineeringTrack[];
    vias?: EngineeringVia[];
    components?: EngineeringComponent[];
    rules?: Partial<DesignRules>;
    omitRule?: keyof DesignRules;
  } = {}
): EngineeringProject {
  const designRules: Record<string, number> = {
    ...zeroRules,
    ...(options.rules ?? {}),
  };
  if (options.omitRule) delete designRules[options.omitRule];
  return {
    components: options.components ?? [],
    wires: [],
    tracks: options.tracks ?? [],
    vias: options.vias ?? [],
    board: farBoard,
    designRules: designRules as DesignRules,
  };
}

function actualOutcome(input: EngineeringProject, targetRule: string): Outcome {
  const findings = validatePcb(input) as Finding[];
  if (findings.some(finding => finding.ruleId === "PCB_INVALID_INPUT"))
    throw new Error(`invalid fixture input for ${targetRule}`);
  if (
    findings.some(
      finding => finding.ruleId === targetRule && finding.severity === "Error"
    )
  )
    return "VIOLATION";
  if (
    findings.some(
      finding =>
        finding.ruleId === "PCB_GEOMETRY_INDETERMINATE" &&
        finding.severity === "Error"
    )
  )
    return "AMBIGUOUS";
  return "CLEAR";
}

function localToWorld(
  local: FloatPoint,
  center: FloatPoint,
  rotation: number
): FloatPoint {
  const rotated = rotatePointIndependent(local, rotation);
  return { x: center.x + rotated.x, y: center.y + rotated.y };
}

function rotateTicks90(value: TickPoint): TickPoint {
  return { x: -value.y, y: value.x };
}

function reflectTicks(value: TickPoint): TickPoint {
  return { x: -value.x, y: value.y };
}

function translateTicks(value: TickPoint, dx: number, dy: number): TickPoint {
  return { x: value.x + dx, y: value.y + dy };
}

describe("Phase 5.4 DRC boundaries and cross-primitive oracle", () => {
  it("matches exact independent outcomes for all six applicable primitive pairs and carries unresolved cases", () => {
    const ledger: Array<{ id: string; oracle: Outcome; actual: Outcome }> = [];
    const unresolved: typeof ledger = [];
    const counts = { tp: 0, tn: 0, fp: 0, fn: 0 };
    const ruleIds: Record<keyof DesignRules, string> = {
      minimumTrackClearance: "PCB_TRACK_CLEARANCE",
      copperToEdgeClearance: "PCB_EDGE_CLEARANCE",
      minimumTrackWidth: "PCB_MINIMUM_TRACK_WIDTH",
      trackToViaClearance: "PCB_TRACK_TO_VIA_CLEARANCE",
      viaToPadClearance: "PCB_VIA_TO_PAD_CLEARANCE",
      minimumViaClearance: "PCB_VIA_TO_VIA_CLEARANCE",
      trackToPadClearance: "PCB_TRACK_TO_PAD_CLEARANCE",
      padToPadClearance: "PCB_PAD_TO_PAD_CLEARANCE",
      minimumDrillDiameter: "PCB_MINIMUM_DRILL_DIAMETER",
      minimumAnnularRing: "PCB_MINIMUM_ANNULAR_RING",
    };
    const record = (id: string, oracle: Outcome, actual: Outcome) => {
      const result = { id, oracle, actual };
      ledger.push(result);
      if (oracle === "AMBIGUOUS" || actual === "AMBIGUOUS") {
        unresolved.push(result);
        return;
      }
      if (oracle === "VIOLATION" && actual === "VIOLATION") counts.tp += 1;
      else if (oracle === "CLEAR" && actual === "CLEAR") counts.tn += 1;
      else if (oracle === "CLEAR" && actual === "VIOLATION") counts.fp += 1;
      else if (oracle === "VIOLATION" && actual === "CLEAR") counts.fn += 1;
      expect(actual, id).toBe(oracle);
    };
    const add = (
      id: string,
      rule: keyof DesignRules,
      fixture: EngineeringProject,
      oracle: Outcome,
      known: Outcome = oracle
    ) => {
      expect(oracle, `${id}-oracle`).toBe(known);
      record(id, oracle, actualOutcome(fixture, ruleIds[rule]));
    };

    const tt = (gap: number, widthA = 200, widthB = 200) => {
      const a = {
        from: { x: -5000, y: 0 },
        to: { x: 5000, y: 0 },
        width: widthA,
      };
      const b = {
        from: { x: -5000, y: gap },
        to: { x: 5000, y: gap },
        width: widthB,
      };
      const oracle = exactTrackTrackOracle(a, b, 200);
      return {
        oracle,
        project: project({
          tracks: [
            track("TT-A", a.from, a.to, widthA),
            track("TT-B", b.from, b.to, widthB),
          ],
          rules: { minimumTrackClearance: unit(200) },
        }),
      };
    };
    for (const fixture of [
      {
        id: "track-track-equality",
        gap: 400,
        wa: 200,
        wb: 200,
        expected: "CLEAR" as const,
      },
      {
        id: "track-track-one-tick-short",
        gap: 399,
        wa: 200,
        wb: 200,
        expected: "VIOLATION" as const,
      },
      {
        id: "track-track-one-tick-over",
        gap: 401,
        wa: 200,
        wb: 200,
        expected: "CLEAR" as const,
      },
      {
        id: "track-track-unequal-width-equality",
        gap: 400,
        wa: 100,
        wb: 300,
        expected: "CLEAR" as const,
      },
      {
        id: "track-track-unequal-width-short",
        gap: 399,
        wa: 100,
        wb: 300,
        expected: "VIOLATION" as const,
      },
      {
        id: "track-track-copper-tangency",
        gap: 200,
        wa: 200,
        wb: 200,
        expected: "VIOLATION" as const,
      },
      {
        id: "track-track-crossing",
        gap: 0,
        wa: 200,
        wb: 200,
        expected: "VIOLATION" as const,
      },
    ]) {
      const result = tt(fixture.gap, fixture.wa, fixture.wb);
      expect(result.oracle, fixture.id).toBe(fixture.expected);
      add(
        fixture.id,
        "minimumTrackClearance",
        result.project,
        result.oracle,
        fixture.expected
      );
    }

    for (const fixture of [
      {
        id: "track-track-zero-length-segment",
        from: { x: 0, y: 0 },
        to: { x: 0, y: 0 },
      },
      {
        id: "track-track-one-tick-segment",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
      },
    ]) {
      const a = { from: fixture.from, to: fixture.to, width: 200 };
      const b = {
        from: { x: -5000, y: 399 },
        to: { x: 5000, y: 399 },
        width: 200,
      };
      const oracle = exactTrackTrackOracle(a, b, 200);
      const input = project({
        tracks: [
          track("DEGEN-A", a.from, a.to, a.width),
          track("DEGEN-B", b.from, b.to, b.width),
        ],
        rules: { minimumTrackClearance: unit(200) },
      });
      expect(oracle, fixture.id).toBe("VIOLATION");
      add(fixture.id, "minimumTrackClearance", input, oracle);
    }

    const tv = (y: number) => {
      const segment = {
        from: { x: -5000, y: 0 },
        to: { x: 5000, y: 0 },
        width: 200,
      };
      const copper = { center: { x: 0, y }, diameter: 600 };
      const oracle = exactTrackViaOracle(segment, copper, 200);
      return {
        oracle,
        project: project({
          tracks: [
            track("TV-T", segment.from, segment.to, segment.width, "F.Cu"),
          ],
          vias: [via("TV-V", copper.center, copper.diameter)],
          rules: { trackToViaClearance: unit(200) },
        }),
      };
    };
    for (const fixture of [
      { id: "track-via-equality", y: 600, expected: "CLEAR" as const },
      { id: "track-via-overlap", y: 0, expected: "VIOLATION" as const },
      {
        id: "track-via-one-tick-short",
        y: 599,
        expected: "VIOLATION" as const,
      },
      { id: "track-via-one-tick-over", y: 601, expected: "CLEAR" as const },
      {
        id: "track-via-copper-tangency",
        y: 400,
        expected: "VIOLATION" as const,
      },
    ]) {
      const result = tv(fixture.y);
      expect(result.oracle, fixture.id).toBe(fixture.expected);
      add(
        fixture.id,
        "trackToViaClearance",
        result.project,
        result.oracle,
        fixture.expected
      );
    }

    const trackCircle = (x: number) => {
      const segment = { from: { x, y: -5000 }, to: { x, y: 5000 }, width: 200 };
      const copper = { center: { x: 0, y: 0 }, diameter: 1000 };
      const oracle = exactTrackCircleOracle(segment, copper, 200);
      return {
        oracle,
        project: project({
          components: [
            padComponent("TP-C", copper.center, {
              width: 1000,
              height: 1000,
              shape: "circle",
            }),
          ],
          tracks: [track("TP-TC", segment.from, segment.to, segment.width)],
          rules: { trackToPadClearance: unit(200) },
        }),
      };
    };
    for (const fixture of [
      { id: "track-circle-equality", x: 800, expected: "CLEAR" as const },
      { id: "track-circle-overlap", x: 0, expected: "VIOLATION" as const },
      {
        id: "track-circle-one-tick-short",
        x: 799,
        expected: "VIOLATION" as const,
      },
      { id: "track-circle-one-tick-over", x: 801, expected: "CLEAR" as const },
      {
        id: "track-circle-copper-tangency",
        x: 600,
        expected: "VIOLATION" as const,
      },
    ]) {
      const result = trackCircle(fixture.x);
      expect(result.oracle, fixture.id).toBe(fixture.expected);
      add(
        fixture.id,
        "trackToPadClearance",
        result.project,
        result.oracle,
        fixture.expected
      );
    }

    const trackRect = (x: number) => {
      const segment = { from: { x, y: -5000 }, to: { x, y: 5000 }, width: 200 };
      const rectangle = { center: { x: 0, y: 0 }, width: 1000, height: 600 };
      const oracle = exactTrackRectOracle(segment, rectangle, 200);
      return {
        oracle,
        project: project({
          components: [
            padComponent("TP-R", rectangle.center, {
              width: rectangle.width,
              height: rectangle.height,
              shape: "rect",
            }),
          ],
          tracks: [track("TP-TR", segment.from, segment.to, segment.width)],
          rules: { trackToPadClearance: unit(200) },
        }),
      };
    };
    for (const fixture of [
      { id: "track-rect-equality", x: 800, expected: "CLEAR" as const },
      { id: "track-rect-overlap", x: 0, expected: "VIOLATION" as const },
      {
        id: "track-rect-one-tick-short",
        x: 799,
        expected: "VIOLATION" as const,
      },
      { id: "track-rect-one-tick-over", x: 801, expected: "CLEAR" as const },
      {
        id: "track-rect-copper-tangency",
        x: 600,
        expected: "VIOLATION" as const,
      },
    ]) {
      const result = trackRect(fixture.x);
      expect(result.oracle, fixture.id).toBe(fixture.expected);
      add(
        fixture.id,
        "trackToPadClearance",
        result.project,
        result.oracle,
        fixture.expected
      );
    }

    const vv = (gap: number) => {
      const a = { center: { x: 0, y: 0 }, diameter: 400 };
      const b = { center: { x: gap, y: 0 }, diameter: 800 };
      const oracle = exactViaViaOracle(a, b, 200);
      return {
        oracle,
        project: project({
          vias: [
            via("VV-A", a.center, a.diameter, ["F.Cu", "B.Cu"]),
            via("VV-B", b.center, b.diameter, ["B.Cu", "F.Cu"]),
          ],
          rules: { minimumViaClearance: unit(200) },
        }),
      };
    };
    for (const fixture of [
      {
        id: "via-via-equality-overlapping-spans",
        gap: 800,
        expected: "CLEAR" as const,
      },
      { id: "via-via-overlap", gap: 0, expected: "VIOLATION" as const },
      {
        id: "via-via-one-tick-short",
        gap: 799,
        expected: "VIOLATION" as const,
      },
      { id: "via-via-one-tick-over", gap: 801, expected: "CLEAR" as const },
      {
        id: "via-via-copper-tangency",
        gap: 600,
        expected: "VIOLATION" as const,
      },
    ]) {
      const result = vv(fixture.gap);
      expect(result.oracle, fixture.id).toBe(fixture.expected);
      add(
        fixture.id,
        "minimumViaClearance",
        result.project,
        result.oracle,
        fixture.expected
      );
    }

    const viaCircle = (x: number) => {
      const copper = { center: { x, y: 0 }, diameter: 400 };
      const circle = { center: { x: 0, y: 0 }, diameter: 1000 };
      const oracle = exactViaCircleOracle(copper, circle, 200);
      return {
        oracle,
        project: project({
          components: [
            padComponent("VP-C", circle.center, {
              width: circle.diameter,
              height: circle.diameter,
              shape: "circle",
            }),
          ],
          vias: [via("VP-VC", copper.center, copper.diameter)],
          rules: { viaToPadClearance: unit(200) },
        }),
      };
    };
    for (const fixture of [
      { id: "via-circle-equality", x: 900, expected: "CLEAR" as const },
      { id: "via-circle-overlap", x: 0, expected: "VIOLATION" as const },
      {
        id: "via-circle-one-tick-short",
        x: 899,
        expected: "VIOLATION" as const,
      },
      { id: "via-circle-one-tick-over", x: 901, expected: "CLEAR" as const },
      {
        id: "via-circle-copper-tangency",
        x: 700,
        expected: "VIOLATION" as const,
      },
    ]) {
      const result = viaCircle(fixture.x);
      expect(result.oracle, fixture.id).toBe(fixture.expected);
      add(
        fixture.id,
        "viaToPadClearance",
        result.project,
        result.oracle,
        fixture.expected
      );
    }

    const viaRect = (x: number) => {
      const copper = { center: { x, y: 0 }, diameter: 400 };
      const rectangle = { center: { x: 0, y: 0 }, width: 1000, height: 600 };
      const oracle = exactViaRectOracle(copper, rectangle, 200);
      return {
        oracle,
        project: project({
          components: [
            padComponent("VP-R", rectangle.center, {
              width: rectangle.width,
              height: rectangle.height,
              shape: "rect",
            }),
          ],
          vias: [via("VP-VR", copper.center, copper.diameter)],
          rules: { viaToPadClearance: unit(200) },
        }),
      };
    };
    for (const fixture of [
      { id: "via-rect-equality", x: 900, expected: "CLEAR" as const },
      { id: "via-rect-overlap", x: 0, expected: "VIOLATION" as const },
      { id: "via-rect-one-tick-short", x: 899, expected: "VIOLATION" as const },
      { id: "via-rect-one-tick-over", x: 901, expected: "CLEAR" as const },
      {
        id: "via-rect-copper-tangency",
        x: 700,
        expected: "VIOLATION" as const,
      },
    ]) {
      const result = viaRect(fixture.x);
      expect(result.oracle, fixture.id).toBe(fixture.expected);
      add(
        fixture.id,
        "viaToPadClearance",
        result.project,
        result.oracle,
        fixture.expected
      );
    }

    const circlePair = (gap: number) => {
      const a = { center: { x: 0, y: 0 }, diameter: 600 };
      const b = { center: { x: gap, y: 0 }, diameter: 1000 };
      const oracle = exactCircleCircleOracle(a, b, 200);
      return {
        oracle,
        project: project({
          components: [
            padComponent("PP-CA", a.center, {
              width: a.diameter,
              height: a.diameter,
              shape: "circle",
            }),
            padComponent("PP-CB", b.center, {
              width: b.diameter,
              height: b.diameter,
              shape: "circle",
            }),
          ],
          rules: { padToPadClearance: unit(200) },
        }),
      };
    };
    for (const fixture of [
      {
        id: "pad-circle-circle-equality",
        gap: 1000,
        expected: "CLEAR" as const,
      },
      {
        id: "pad-circle-circle-overlap",
        gap: 0,
        expected: "VIOLATION" as const,
      },
      {
        id: "pad-circle-circle-one-tick-short",
        gap: 999,
        expected: "VIOLATION" as const,
      },
      {
        id: "pad-circle-circle-one-tick-over",
        gap: 1001,
        expected: "CLEAR" as const,
      },
      {
        id: "pad-circle-circle-copper-tangency",
        gap: 800,
        expected: "VIOLATION" as const,
      },
    ]) {
      const result = circlePair(fixture.gap);
      expect(result.oracle, fixture.id).toBe(fixture.expected);
      add(
        fixture.id,
        "padToPadClearance",
        result.project,
        result.oracle,
        fixture.expected
      );
    }

    const rectPair = (gap: number) => {
      const a = { center: { x: 0, y: 0 }, width: 1000, height: 600 };
      const b = { center: { x: gap, y: 0 }, width: 600, height: 600 };
      const oracle = exactRectRectOracle(a, b, 200);
      return {
        oracle,
        project: project({
          components: [
            padComponent("PP-RA", a.center, {
              width: a.width,
              height: a.height,
              shape: "rect",
            }),
            padComponent("PP-RB", b.center, {
              width: b.width,
              height: b.height,
              shape: "rect",
            }),
          ],
          rules: { padToPadClearance: unit(200) },
        }),
      };
    };
    for (const fixture of [
      { id: "pad-rect-rect-equality", gap: 1000, expected: "CLEAR" as const },
      { id: "pad-rect-rect-overlap", gap: 0, expected: "VIOLATION" as const },
      {
        id: "pad-rect-rect-one-tick-short",
        gap: 999,
        expected: "VIOLATION" as const,
      },
      {
        id: "pad-rect-rect-one-tick-over",
        gap: 1001,
        expected: "CLEAR" as const,
      },
      {
        id: "pad-rect-rect-copper-tangency",
        gap: 800,
        expected: "VIOLATION" as const,
      },
    ]) {
      const result = rectPair(fixture.gap);
      expect(result.oracle, fixture.id).toBe(fixture.expected);
      add(
        fixture.id,
        "padToPadClearance",
        result.project,
        result.oracle,
        fixture.expected
      );
    }

    // Rotated/non-axis-aligned track and via cases use independent corner
    // construction with an explicit fixed-grid error envelope. These are kept
    // away from the threshold so the interval oracle must decide them.
    const rotatedCenter: FloatPoint = { x: 0, y: 0 };
    const rotatedAngle = 37;
    const rotatedSpec = {
      width: 6000,
      height: 2000,
      shape: "rect" as const,
      padRotation: rotatedAngle,
    };
    const rotatedTrackCases = [
      {
        id: "rotated-track-rectangle-overlap",
        from: localToWorld({ x: -8, y: 0 }, rotatedCenter, rotatedAngle),
        to: localToWorld({ x: 8, y: 0 }, rotatedCenter, rotatedAngle),
        expected: "VIOLATION" as const,
      },
      {
        id: "rotated-diagonal-track-rectangle-clear",
        from: localToWorld({ x: -8, y: 4 }, rotatedCenter, rotatedAngle),
        to: localToWorld({ x: 8, y: 4 }, rotatedCenter, rotatedAngle),
        expected: "CLEAR" as const,
      },
    ];
    for (const fixture of rotatedTrackCases) {
      const input = project({
        components: [
          padComponent(`ROT-${fixture.id}`, { x: 0, y: 0 }, rotatedSpec),
        ],
        tracks: [
          {
            id: `T-${fixture.id}`,
            from: fixture.from,
            to: fixture.to,
            width: 0.2,
            layer: "F.Cu",
          },
        ],
        rules: { trackToPadClearance: 0.3 },
      });
      const interval = segmentToRotatedRectangleDistanceInterval(
        fixture.from,
        fixture.to,
        rotatedCenter,
        6,
        2,
        rotatedAngle
      );
      const oracle = classifyDistanceInterval(interval, 0.2 / 2 + 0.3);
      expect(oracle, fixture.id).toBe(fixture.expected);
      record(
        fixture.id,
        oracle,
        actualOutcome(input, "PCB_TRACK_TO_PAD_CLEARANCE")
      );
    }

    const rotatedViaCases = [
      {
        id: "rotated-via-near-edge-violation",
        local: { x: 0, y: 1.25 },
        expected: "VIOLATION" as const,
      },
      {
        id: "rotated-via-near-corner-clear",
        local: { x: 3.5, y: 1.5 },
        expected: "CLEAR" as const,
      },
    ];
    for (const fixture of rotatedViaCases) {
      const worldCenter = localToWorld(
        fixture.local,
        rotatedCenter,
        rotatedAngle
      );
      const input = project({
        components: [
          padComponent(`ROT-${fixture.id}`, { x: 0, y: 0 }, rotatedSpec),
        ],
        vias: [
          {
            id: `V-${fixture.id}`,
            x: worldCenter.x,
            y: worldCenter.y,
            drill: 0.08,
            diameter: 0.2,
            layers: ["F.Cu", "B.Cu"],
          },
        ],
        rules: { viaToPadClearance: 0.2 },
      });
      const interval = pointToRotatedRectangleDistanceInterval(
        worldCenter,
        rotatedCenter,
        6,
        2,
        rotatedAngle
      );
      const oracle = classifyDistanceInterval(interval, 0.1 + 0.2);
      expect(oracle, fixture.id).toBe(fixture.expected);
      record(
        fixture.id,
        oracle,
        actualOutcome(input, "PCB_VIA_TO_PAD_CLEARANCE")
      );
    }

    // Five exact, label-free metamorphic transformations of a track-pair violation.
    const seed = {
      a: { from: { x: -5000, y: 0 }, to: { x: 5000, y: 0 }, width: 200 },
      b: { from: { x: -5000, y: 399 }, to: { x: 5000, y: 399 }, width: 200 },
    };
    const transform = (
      name: string,
      pointMap: (value: TickPoint) => TickPoint,
      scale: number,
      reverse = false
    ) => {
      const mapSegment = (segment: typeof seed.a) => {
        const mapped = {
          from: pointMap(segment.from),
          to: pointMap(segment.to),
          width: segment.width * scale,
        };
        return reverse
          ? { ...mapped, from: mapped.to, to: mapped.from }
          : mapped;
      };
      const a = mapSegment(seed.a);
      const b = mapSegment(seed.b);
      const clearance = 200 * scale;
      const oracle = exactTrackTrackOracle(a, b, clearance);
      const fixture = project({
        tracks: [
          track("META-A", a.from, a.to, a.width),
          track("META-B", b.from, b.to, b.width),
        ],
        rules: { minimumTrackClearance: unit(clearance) },
      });
      expect(oracle, `metamorphic-${name}-oracle`).toBe("VIOLATION");
      record(
        `metamorphic-${name}`,
        oracle,
        actualOutcome(fixture, "PCB_TRACK_CLEARANCE")
      );
    };
    transform("translation", p => translateTicks(p, 13000, -7000), 1);
    transform("rigid-rotation-90", rotateTicks90, 1);
    transform("reflection", reflectTicks, 1);
    transform("uniform-scale-2", p => ({ x: 2 * p.x, y: 2 * p.y }), 2);
    transform("endpoint-reversal", p => p, 1, true);

    // Reproduce, but do not reclassify as passing, the three Phase 5.3.8 boundaries.
    const zero: FloatPoint = { x: 0, y: 0 };
    const requiredTrack = 0.2 / 2 + 0.3;
    const eqFrom = localToWorld({ x: -8, y: 2 + requiredTrack }, zero, 90);
    const eqTo = localToWorld({ x: 8, y: 2 + requiredTrack }, zero, 90);
    const eqProject = project({
      components: [
        padComponent(
          "U-EQ",
          { x: 0, y: 0 },
          { width: 6000, height: 4000, shape: "rect", padRotation: 90 }
        ),
      ],
      tracks: [
        { id: "T-EQ", from: eqFrom, to: eqTo, width: 0.2, layer: "F.Cu" },
      ],
      rules: { trackToPadClearance: 0.3 },
    });
    const eqInterval: DistanceInterval =
      segmentToRotatedRectangleDistanceInterval(eqFrom, eqTo, zero, 6, 4, 90);
    record(
      "phase538-track-pad-equality-90deg",
      classifyDistanceInterval(eqInterval, requiredTrack),
      actualOutcome(eqProject, "PCB_TRACK_TO_PAD_CLEARANCE")
    );

    const tangentFrom = localToWorld({ x: -8, y: 2 + requiredTrack }, zero, 31);
    const tangentTo = localToWorld({ x: 8, y: 2 + requiredTrack }, zero, 31);
    const tangentProject = project({
      components: [
        padComponent(
          "U-TAN",
          { x: 0, y: 0 },
          { width: 6000, height: 4000, shape: "rect", padRotation: 31 }
        ),
      ],
      tracks: [
        {
          id: "T-TAN",
          from: tangentFrom,
          to: tangentTo,
          width: 0.2,
          layer: "F.Cu",
        },
      ],
      rules: { trackToPadClearance: 0.3 },
    });
    const tangentInterval = segmentToRotatedRectangleDistanceInterval(
      tangentFrom,
      tangentTo,
      zero,
      6,
      4,
      31
    );
    record(
      "phase538-track-pad-tangency-31deg",
      classifyDistanceInterval(tangentInterval, requiredTrack),
      actualOutcome(tangentProject, "PCB_TRACK_TO_PAD_CLEARANCE")
    );

    const viaPadCenter: FloatPoint = { x: 20, y: 30 };
    const viaLocal: FloatPoint = { x: 0, y: 2.5 };
    const rotatedVia = localToWorld(viaLocal, viaPadCenter, 90);
    const viaEqProject = project({
      components: [
        padComponent(
          "U-VIA-EQ",
          { x: 20000, y: 30000 },
          { width: 6000, height: 4000, shape: "rect", padRotation: 90 }
        ),
      ],
      vias: [
        {
          id: "V-EQ",
          x: rotatedVia.x,
          y: rotatedVia.y,
          drill: 0.2,
          diameter: 0.4,
          layers: ["F.Cu", "B.Cu"],
        },
      ],
      rules: { viaToPadClearance: 0.3 },
    });
    const viaEqInterval = pointToRotatedRectangleDistanceInterval(
      rotatedVia,
      viaPadCenter,
      6,
      4,
      90
    );
    record(
      "phase538-via-pad-equality-90deg",
      classifyDistanceInterval(viaEqInterval, 0.2 + 0.3),
      actualOutcome(viaEqProject, "PCB_VIA_TO_PAD_CLEARANCE")
    );

    // Independent local-frame exact certificates for the ideal decimal/tick
    // geometry at 90 degrees and 31 degrees. Orthogonal rotation preserves these
    // rational distances; the fixed-grid interval still cannot certify a tie.
    const exactLocalEqualityTrack = {
      from: { x: -8000, y: 2400 },
      to: { x: 8000, y: 2400 },
      width: 200,
    };
    const exactLocalRectangle = {
      center: { x: 0, y: 0 },
      width: 6000,
      height: 4000,
    };
    expect(
      exactTrackRectOracle(exactLocalEqualityTrack, exactLocalRectangle, 300),
      "exact local-frame track equality for the 90-degree fixture"
    ).toBe("CLEAR");
    expect(
      exactTrackRectOracle(exactLocalEqualityTrack, exactLocalRectangle, 300),
      "exact local-frame track equality for the 31-degree fixture"
    ).toBe("CLEAR");
    expect(
      exactViaRectOracle(
        { center: { x: 0, y: 2500 }, diameter: 400 },
        exactLocalRectangle,
        300
      ),
      "exact local-frame via equality for the 90-degree fixture"
    ).toBe("CLEAR");

    expect(ledger).toHaveLength(61);
    expect({ ...counts, unresolved: unresolved.length }).toEqual({
      tp: 37,
      tn: 18,
      fp: 0,
      fn: 0,
      unresolved: 6,
    });
    expect(unresolved).toEqual([
      {
        id: "track-via-equality",
        oracle: "CLEAR",
        actual: "AMBIGUOUS",
      },
      {
        id: "pad-circle-circle-equality",
        oracle: "CLEAR",
        actual: "AMBIGUOUS",
      },
      {
        id: "pad-rect-rect-equality",
        oracle: "CLEAR",
        actual: "AMBIGUOUS",
      },
      {
        id: "phase538-track-pad-equality-90deg",
        oracle: "AMBIGUOUS",
        actual: "AMBIGUOUS",
      },
      {
        id: "phase538-track-pad-tangency-31deg",
        oracle: "AMBIGUOUS",
        actual: "AMBIGUOUS",
      },
      {
        id: "phase538-via-pad-equality-90deg",
        oracle: "AMBIGUOUS",
        actual: "CLEAR",
      },
    ]);
  });

  it("characterizes layer applicability, via-span validation, and rule-absent behavior", () => {
    const crossingTrack = {
      from: { x: -5000, y: 0 },
      to: { x: 5000, y: 0 },
    };
    const sameTrackPair = project({
      tracks: [
        track("L-TA", crossingTrack.from, crossingTrack.to, 200, "F.Cu"),
        track("L-TB", crossingTrack.from, crossingTrack.to, 200, "B.Cu"),
      ],
      rules: { minimumTrackClearance: unit(200) },
    });
    expect(actualOutcome(sameTrackPair, "PCB_TRACK_CLEARANCE")).toBe("CLEAR");

    const frontPad = padComponent(
      "L-FRONT",
      { x: 0, y: 0 },
      { width: 2000, height: 2000, shape: "circle", layer: "F.Cu" }
    );
    const backTrack = project({
      components: [frontPad],
      tracks: [
        track(
          "L-BACK-TRACK",
          crossingTrack.from,
          crossingTrack.to,
          200,
          "B.Cu"
        ),
      ],
      rules: { trackToPadClearance: unit(200) },
    });
    expect(actualOutcome(backTrack, "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(
      "CLEAR"
    );

    const explicitBoth = padComponent(
      "L-BOTH",
      { x: 0, y: 0 },
      {
        width: 2000,
        height: 2000,
        shape: "circle",
        layer: "F.Cu",
        layers: ["F.Cu", "B.Cu"],
      }
    );
    const backTrackToBoth = project({
      components: [explicitBoth],
      tracks: [
        track(
          "L-BACK-TRACK-BOTH",
          crossingTrack.from,
          crossingTrack.to,
          200,
          "B.Cu"
        ),
      ],
      rules: { trackToPadClearance: unit(200) },
    });
    expect(actualOutcome(backTrackToBoth, "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(
      "VIOLATION"
    );

    const platedFallback = padComponent(
      "L-TH",
      { x: 0, y: 0 },
      {
        width: 2000,
        height: 2000,
        shape: "circle",
        layer: "F.Cu",
        plated: true,
        drill: 800,
      }
    );
    const backTrackToPlated = project({
      components: [platedFallback],
      tracks: [
        track(
          "L-BACK-TRACK-TH",
          crossingTrack.from,
          crossingTrack.to,
          200,
          "B.Cu"
        ),
      ],
      rules: { trackToPadClearance: unit(200) },
    });
    expect(actualOutcome(backTrackToPlated, "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(
      "VIOLATION"
    );

    const oppositePads = project({
      components: [
        padComponent(
          "L-PAD-F",
          { x: 0, y: 0 },
          { width: 2000, height: 2000, shape: "circle", layer: "F.Cu" }
        ),
        padComponent(
          "L-PAD-B",
          { x: 0, y: 0 },
          { width: 2000, height: 2000, shape: "circle", layer: "B.Cu" }
        ),
      ],
      rules: { padToPadClearance: unit(100) },
    });
    expect(actualOutcome(oppositePads, "PCB_PAD_TO_PAD_CLEARANCE")).toBe(
      "CLEAR"
    );

    const viaBothDirections = (layers: [Layer, Layer]) =>
      project({
        tracks: [
          track(
            "L-VIA-TRACK",
            crossingTrack.from,
            crossingTrack.to,
            200,
            "B.Cu"
          ),
        ],
        vias: [via("L-VIA", { x: 0, y: 0 }, 800, layers)],
        rules: { trackToViaClearance: unit(100) },
      });
    expect(
      actualOutcome(
        viaBothDirections(["F.Cu", "B.Cu"]),
        "PCB_TRACK_TO_VIA_CLEARANCE"
      )
    ).toBe("VIOLATION");
    expect(
      actualOutcome(
        viaBothDirections(["B.Cu", "F.Cu"]),
        "PCB_TRACK_TO_VIA_CLEARANCE"
      )
    ).toBe("VIOLATION");

    const noViaSpan = project({
      components: [frontPad],
      tracks: [
        track(
          "L-NO-SPAN-TRACK",
          crossingTrack.from,
          crossingTrack.to,
          200,
          "F.Cu"
        ),
      ],
      vias: [via("L-NO-SPAN-VIA", { x: 0, y: 0 }, 800, null)],
      rules: {
        trackToViaClearance: unit(100),
        viaToPadClearance: unit(100),
      },
    });
    const noSpanFindings = validatePcb(noViaSpan) as Finding[];
    expect(
      noSpanFindings.some(item => item.ruleId === "PCB_TRACK_TO_VIA_CLEARANCE")
    ).toBe(false);
    expect(
      noSpanFindings.some(item => item.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")
    ).toBe(false);
    expect(
      noSpanFindings.some(
        item =>
          item.ruleId === "PCB_VIA_LAYER_SPAN_UNAVAILABLE" &&
          item.severity === "Info"
      )
    ).toBe(true);

    const sameNetTracks = project({
      tracks: [
        track(
          "NET-A",
          crossingTrack.from,
          crossingTrack.to,
          200,
          "F.Cu",
          "GND"
        ),
        track(
          "NET-B",
          crossingTrack.from,
          crossingTrack.to,
          200,
          "F.Cu",
          "GND"
        ),
      ],
      rules: { minimumTrackClearance: unit(200) },
    });
    // The current validator applies geometric spacing regardless of net IDs;
    // this is recorded as observed behavior, not endorsed as intended policy.
    expect(actualOutcome(sameNetTracks, "PCB_TRACK_CLEARANCE")).toBe(
      "VIOLATION"
    );

    const invalidSpan = {
      components: [],
      wires: [],
      tracks: [],
      vias: [
        {
          id: "BAD-V",
          x: 0,
          y: 0,
          drill: 0.2,
          diameter: 0.4,
          layers: ["F.Cu"],
        },
      ],
      board: farBoard,
      designRules: zeroRules,
    };
    expect(validateProjectJsonDetailed(invalidSpan).ok).toBe(false);
    expect((validatePcb(invalidSpan as never) as Finding[])[0]?.ruleId).toBe(
      "PCB_INVALID_INPUT"
    );
    expect(runDesignRules(invalidSpan as never)[0]?.ruleId).toBe(
      "PROJECT_INVALID"
    );

    const ruleOmitted = project({
      tracks: [
        track("NO-RULE-A", crossingTrack.from, crossingTrack.to, 200),
        track("NO-RULE-B", crossingTrack.from, crossingTrack.to, 200),
      ],
      omitRule: "minimumTrackClearance",
    });
    const omittedFindings = validatePcb(ruleOmitted) as Finding[];
    expect(
      omittedFindings.some(item => item.ruleId === "PCB_TRACK_CLEARANCE")
    ).toBe(false);
    expect(
      omittedFindings.filter(item => item.ruleId === "PCB_RULE_UNCONFIGURED")
    ).toHaveLength(2);
  });

  it("characterizes inclusive equality and fail-closed shortfalls within comparator uncertainty", () => {
    const circle = padComponent(
      "EPS-CIRCLE",
      { x: 0, y: 0 },
      { width: 1000, height: 1000, shape: "circle" }
    );
    const width = 250 / TICKS;
    const clearance = 375 / TICKS;
    const required = width / 2 + clearance;
    const locations = [
      { id: "equality", x: 1, expected: "CLEAR" as const },
      {
        id: "within-16-epsilon-shortfall",
        x: 1 - 4 * Number.EPSILON,
        expected: "AMBIGUOUS" as const,
      },
      {
        id: "beyond-16-epsilon-shortfall",
        x: 1 - 16 * Number.EPSILON,
        expected: "VIOLATION" as const,
      },
      {
        id: "above-threshold",
        x: 1 + 4 * Number.EPSILON,
        expected: "CLEAR" as const,
      },
    ];
    for (const item of locations) {
      const from = { x: item.x, y: -10 };
      const to = { x: item.x, y: 10 };
      const projectInput = project({
        components: [circle],
        tracks: [{ id: `EPS-${item.id}`, from, to, width, layer: "F.Cu" }],
        rules: { trackToPadClearance: clearance },
      });
      // Independent closed-form circle/vertical-segment gap plus the documented
      // comparison tolerance; this intentionally tests the comparator contract,
      // not a fixed-grid oracle below its resolution.
      const measuredGap = Math.abs(item.x) - 0.5;
      const independent: Outcome =
        measuredGap >= required
          ? "CLEAR"
          : required - measuredGap <=
              Number.EPSILON *
                Math.max(
                  Math.abs(measuredGap),
                  Math.abs(required),
                  Number.MIN_VALUE
                ) *
                16
            ? "AMBIGUOUS"
            : "VIOLATION";
      expect(independent, item.id).toBe(item.expected);
      expect(
        actualOutcome(projectInput, "PCB_TRACK_TO_PAD_CLEARANCE"),
        item.id
      ).toBe(independent);
    }
  });

  it("checks copper edge inset separately from physical board containment for all copper primitive types", () => {
    const board = { x: 0, y: 0, width: 100, height: 80, edgeClearance: 1 };
    const edgeProject = (options: {
      tracks?: EngineeringTrack[];
      vias?: EngineeringVia[];
      components?: EngineeringComponent[];
    }) =>
      ({
        ...project(options),
        board,
        designRules: {
          ...zeroRules,
          copperToEdgeClearance: board.edgeClearance,
        },
      }) as EngineeringProject;

    const tracks = [
      { id: "EDGE-TRACK-EQ", x: 2000, expected: false },
      { id: "EDGE-TRACK-BELOW", x: 1999, expected: true },
      { id: "EDGE-TRACK-ABOVE", x: 2001, expected: false },
    ];
    for (const fixture of tracks) {
      const findings = validatePcb(
        edgeProject({
          tracks: [
            track(
              fixture.id,
              { x: fixture.x, y: 20000 },
              { x: fixture.x, y: 60000 },
              2000
            ),
          ],
        })
      ) as Finding[];
      expect(findings.some(item => item.ruleId === "PCB_EDGE_CLEARANCE")).toBe(
        fixture.expected
      );
    }

    const vias = [
      { id: "EDGE-VIA-EQ", x: 2000, expected: false },
      { id: "EDGE-VIA-BELOW", x: 1999, expected: true },
      { id: "EDGE-VIA-ABOVE", x: 2001, expected: false },
    ];
    for (const fixture of vias) {
      const findings = validatePcb(
        edgeProject({
          vias: [via(fixture.id, { x: fixture.x, y: 20000 }, 2000)],
        })
      ) as Finding[];
      expect(
        findings.some(item => item.ruleId === "PCB_VIA_EDGE_CLEARANCE")
      ).toBe(fixture.expected);
    }

    const circles = [
      { id: "EDGE-CIRCLE-EQ", x: 2000, expected: false },
      { id: "EDGE-CIRCLE-BELOW", x: 1999, expected: true },
      { id: "EDGE-CIRCLE-ABOVE", x: 2001, expected: false },
    ];
    for (const fixture of circles) {
      const findings = validatePcb(
        edgeProject({
          components: [
            padComponent(
              fixture.id,
              { x: fixture.x, y: 20000 },
              { width: 2000, height: 2000, shape: "circle" }
            ),
          ],
        })
      ) as Finding[];
      expect(
        findings.some(item => item.ruleId === "PCB_PAD_EDGE_CLEARANCE")
      ).toBe(fixture.expected);
    }

    const rectangles = [
      { id: "EDGE-RECT-EQ", x: 5000, expected: false },
      { id: "EDGE-RECT-BELOW", x: 4999, expected: true },
      { id: "EDGE-RECT-ABOVE", x: 5001, expected: false },
    ];
    for (const fixture of rectangles) {
      const findings = validatePcb(
        edgeProject({
          components: [
            padComponent(
              fixture.id,
              { x: fixture.x, y: 20000 },
              { width: 8000, height: 2000, shape: "rect" }
            ),
          ],
        })
      ) as Finding[];
      expect(
        findings.some(item => item.ruleId === "PCB_PAD_EDGE_CLEARANCE")
      ).toBe(fixture.expected);
    }

    // Independently compute rotated AABB extents, then test immediately outside
    // and inside the copper inset at every board side (not a production helper).
    const angle = (45 * Math.PI) / 180;
    const halfX =
      (Math.abs(Math.cos(angle)) * 8) / 2 + (Math.abs(Math.sin(angle)) * 2) / 2;
    const halfY =
      (Math.abs(Math.sin(angle)) * 8) / 2 + (Math.abs(Math.cos(angle)) * 2) / 2;
    const offset = 0.01;
    const rotatedCases = [
      {
        name: "left-out",
        center: { x: board.x + board.edgeClearance + halfX - offset, y: 40 },
        side: "left",
        expected: true,
      },
      {
        name: "left-in",
        center: { x: board.x + board.edgeClearance + halfX + offset, y: 40 },
        side: "left",
        expected: false,
      },
      {
        name: "right-out",
        center: {
          x: board.x + board.width - board.edgeClearance - halfX + offset,
          y: 40,
        },
        side: "right",
        expected: true,
      },
      {
        name: "right-in",
        center: {
          x: board.x + board.width - board.edgeClearance - halfX - offset,
          y: 40,
        },
        side: "right",
        expected: false,
      },
      {
        name: "top-out",
        center: { x: 50, y: board.y + board.edgeClearance + halfY - offset },
        side: "top",
        expected: true,
      },
      {
        name: "top-in",
        center: { x: 50, y: board.y + board.edgeClearance + halfY + offset },
        side: "top",
        expected: false,
      },
      {
        name: "bottom-out",
        center: {
          x: 50,
          y: board.y + board.height - board.edgeClearance - halfY + offset,
        },
        side: "bottom",
        expected: true,
      },
      {
        name: "bottom-in",
        center: {
          x: 50,
          y: board.y + board.height - board.edgeClearance - halfY - offset,
        },
        side: "bottom",
        expected: false,
      },
    ];
    for (const fixture of rotatedCases) {
      const centerTicks = {
        x: fixture.center.x * TICKS,
        y: fixture.center.y * TICKS,
      };
      const component = padComponent(`EDGE-ROT-${fixture.name}`, centerTicks, {
        width: 8000,
        height: 2000,
        shape: "rect",
        componentRotation: 45,
      });
      const findings = validatePcb(
        edgeProject({ components: [component] })
      ) as Finding[];
      expect(
        findings.some(item => item.ruleId === "PCB_PAD_EDGE_CLEARANCE")
      ).toBe(fixture.expected);
      expect(fixture.side).toMatch(/left|right|top|bottom/);
    }

    // Two distinct causes share one rule ID: physical copper protrusion with no
    // inset requirement, versus copper still on-board but short of the inset.
    const physicallyOutside = {
      ...project({
        tracks: [
          track(
            "EDGE-PHYSICAL-OUT",
            { x: 999, y: 20000 },
            { x: 999, y: 60000 },
            2000
          ),
        ],
      }),
      board: { ...board, edgeClearance: 0 },
      designRules: { ...zeroRules, copperToEdgeClearance: 0 },
    } as EngineeringProject;
    const insetOnly = {
      ...project({
        tracks: [
          track(
            "EDGE-INSET-ONLY",
            { x: 1999, y: 20000 },
            { x: 1999, y: 60000 },
            2000
          ),
        ],
      }),
      board,
      designRules: { ...zeroRules, copperToEdgeClearance: 1 },
    } as EngineeringProject;
    const physicallyOutsideFindings = validatePcb(
      physicallyOutside
    ) as Finding[];
    const insetOnlyFindings = validatePcb(insetOnly) as Finding[];
    expect(0.999 - 1).toBeLessThan(0); // copper crosses the physical x=0 board edge
    expect(1.999 - 1).toBeGreaterThan(0); // copper remains on-board, but misses the 1-unit inset
    expect(
      physicallyOutsideFindings.some(
        item => item.ruleId === "PCB_EDGE_CLEARANCE"
      )
    ).toBe(true);
    expect(
      insetOnlyFindings.some(item => item.ruleId === "PCB_EDGE_CLEARANCE")
    ).toBe(true);
  });

  it("records zero-clearance overlap behavior without treating the policy as settled", () => {
    const padOverlap = project({
      components: [
        padComponent(
          "ZERO-OVERLAP-A",
          { x: 0, y: 0 },
          { width: 2000, height: 2000, shape: "circle" }
        ),
        padComponent(
          "ZERO-OVERLAP-B",
          { x: 1000, y: 0 },
          { width: 2000, height: 2000, shape: "circle" }
        ),
      ],
      rules: { padToPadClearance: 0 },
    });
    const viaOverlap = project({
      components: [
        padComponent(
          "ZERO-VIA-PAD",
          { x: 0, y: 0 },
          { width: 2000, height: 2000, shape: "rect" }
        ),
      ],
      vias: [via("ZERO-VIA", { x: 0, y: 0 }, 400)],
      rules: { viaToPadClearance: 0 },
    });
    const padTangent = project({
      components: [
        padComponent(
          "ZERO-TANGENT-A",
          { x: 0, y: 0 },
          { width: 2000, height: 2000, shape: "circle" }
        ),
        padComponent(
          "ZERO-TANGENT-B",
          { x: 2000, y: 0 },
          { width: 2000, height: 2000, shape: "circle" }
        ),
      ],
      rules: { padToPadClearance: 0 },
    });

    // Independent signed overlap depths: circle radii sum to 2 units while
    // centers are 1 unit apart; the via center lies strictly inside the rect.
    const circleOverlapDepth = 2 - 1;
    const viaCenterInsideRect = Math.abs(0) < 1 && Math.abs(0) < 1;
    expect(circleOverlapDepth).toBeGreaterThan(0);
    expect(viaCenterInsideRect).toBe(true);
    expect(actualOutcome(padOverlap, "PCB_PAD_TO_PAD_CLEARANCE")).toBe("CLEAR");
    expect(actualOutcome(viaOverlap, "PCB_VIA_TO_PAD_CLEARANCE")).toBe("CLEAR");
    expect(actualOutcome(padTangent, "PCB_PAD_TO_PAD_CLEARANCE")).toBe("CLEAR");
  });
});
