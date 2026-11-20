import { describe, expect, it } from "vitest";
import { padToPadDistanceDetailed, validatePcb } from "./engineering";
import {
  classifyDistanceInterval,
  compareSquaredDistanceToLengthSquared,
  distanceApprox,
  ellipseRectangleDistanceInterval,
  pointAxisAlignedBoxDistanceSquaredExact,
  pointEllipseDistanceInterval,
  pointSegmentDistanceSquaredExact,
  rotatePointIndependent,
  segmentAxisAlignedBoxDistanceSquaredExact,
  segmentDistanceSquaredExact,
  segmentEllipseDistanceInterval,
  segmentsIntersectExact,
  tickPoint,
  type DistanceInterval,
  type TickPoint,
} from "./phase5_3.independent-oracle";

const TICKS = 1000;
const world = (ticks: number) => ticks / TICKS;
const p = (x: number, y: number) => ({ x: world(x), y: world(y) });
const farBoard = {
  x: -10_000,
  y: -10_000,
  width: 20_000,
  height: 20_000,
  edgeClearance: 0,
};
const zeroRules = {
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
const cleanProject = {
  components: [] as any[],
  tracks: [] as any[],
  vias: [] as any[],
  board: farBoard,
  designRules: zeroRules,
};

type Class = "CLEAR" | "VIOLATION" | "AMBIGUOUS";
type Finding = { ruleId: string; severity: string; objectIds: string[] };

function pad(
  id: string,
  widthTicks: number,
  heightTicks: number,
  shape: "circle" | "rect" | "oval" = "rect",
  rotation = 0,
  xTicks = 0,
  yTicks = 0
) {
  return {
    id,
    number: id,
    position: p(xTicks, yTicks),
    width: world(widthTicks),
    height: world(heightTicks),
    shape,
    layer: "F.Cu" as const,
    rotation,
  };
}

function component(
  id: string,
  item: ReturnType<typeof pad>,
  xTicks = 0,
  yTicks = 0,
  rotation = 0
) {
  return {
    id,
    ref: id,
    x: world(xTicks),
    y: world(yTicks),
    rotation,
    footprintGeometry: { identifier: `FP-${id}`, pads: [item] },
  };
}

function run(project: unknown): Finding[] {
  return validatePcb(project as never) as Finding[];
}

function classifyFindings(findings: Finding[], targetRule: string): Class {
  if (
    findings.some(
      item => item.ruleId === targetRule && item.severity === "Error"
    )
  )
    return "VIOLATION";
  if (
    findings.some(
      item =>
        item.ruleId === "PCB_GEOMETRY_INDETERMINATE" &&
        item.severity === "Error"
    )
  )
    return "AMBIGUOUS";
  return "CLEAR";
}

function exactSquaredClass(
  distanceSquared: ReturnType<typeof pointSegmentDistanceSquaredExact>,
  required: bigint
): Class {
  return compareSquaredDistanceToLengthSquared(distanceSquared, required) >= 0
    ? "CLEAR"
    : "VIOLATION";
}

function doubledPoint(pointTicks: TickPoint): TickPoint {
  return { x: 2n * pointTicks.x, y: 2n * pointTicks.y };
}

function circleTrackOracle(
  fromTicks: TickPoint,
  toTicks: TickPoint,
  centerTicks: TickPoint,
  trackWidthTicks: bigint,
  padDiameterTicks: bigint,
  clearanceTicks: bigint
): Class {
  const squared = pointSegmentDistanceSquaredExact(
    doubledPoint(centerTicks),
    doubledPoint(fromTicks),
    doubledPoint(toTicks)
  );
  const requiredDoubledTicks =
    trackWidthTicks + padDiameterTicks + 2n * clearanceTicks;
  return exactSquaredClass(squared, requiredDoubledTicks);
}

function trackTrackOracle(
  aStart: TickPoint,
  aEnd: TickPoint,
  aWidthTicks: bigint,
  bStart: TickPoint,
  bEnd: TickPoint,
  bWidthTicks: bigint,
  clearanceTicks: bigint
): Class {
  const squared = segmentDistanceSquaredExact(
    doubledPoint(aStart),
    doubledPoint(aEnd),
    doubledPoint(bStart),
    doubledPoint(bEnd)
  );
  return exactSquaredClass(
    squared,
    aWidthTicks + bWidthTicks + 2n * clearanceTicks
  );
}

function rectTrackOracle(
  fromTicks: TickPoint,
  toTicks: TickPoint,
  widthTicks: bigint,
  heightTicks: bigint,
  trackWidthTicks: bigint,
  clearanceTicks: bigint
): Class {
  const squared = segmentAxisAlignedBoxDistanceSquaredExact(
    doubledPoint(fromTicks),
    doubledPoint(toTicks),
    -widthTicks,
    -heightTicks,
    widthTicks,
    heightTicks
  );
  return exactSquaredClass(squared, trackWidthTicks + 2n * clearanceTicks);
}

function viaCircleOracle(
  viaTicks: TickPoint,
  padCenterTicks: TickPoint,
  viaDiameterTicks: bigint,
  padDiameterTicks: bigint,
  clearanceTicks: bigint
): Class {
  const squared = pointSegmentDistanceSquaredExact(
    doubledPoint(viaTicks),
    doubledPoint(padCenterTicks),
    doubledPoint(padCenterTicks)
  );
  return exactSquaredClass(
    squared,
    viaDiameterTicks + padDiameterTicks + 2n * clearanceTicks
  );
}

function viaRectOracle(
  viaTicks: TickPoint,
  padCenterTicks: TickPoint,
  widthTicks: bigint,
  heightTicks: bigint,
  viaDiameterTicks: bigint,
  clearanceTicks: bigint
): Class {
  const point = doubledPoint(viaTicks);
  const center = doubledPoint(padCenterTicks);
  const squared = pointAxisAlignedBoxDistanceSquaredExact(
    point,
    center.x - widthTicks,
    center.y - heightTicks,
    center.x + widthTicks,
    center.y + heightTicks
  );
  return exactSquaredClass(squared, viaDiameterTicks + 2n * clearanceTicks);
}

function axisGapOracle(gapDoubledTicks: bigint, clearanceTicks: bigint): Class {
  const nonNegativeGap = gapDoubledTicks > 0n ? gapDoubledTicks : 0n;
  return exactSquaredClass(
    { numerator: nonNegativeGap * nonNegativeGap, denominator: 1n },
    2n * clearanceTicks
  );
}

function rectanglePairOracle(
  firstCenter: TickPoint,
  firstWidth: bigint,
  firstHeight: bigint,
  secondCenter: TickPoint,
  secondWidth: bigint,
  secondHeight: bigint,
  clearanceTicks: bigint
): Class {
  const gapX = 2n * (firstCenter.x - secondCenter.x);
  const gapY = 2n * (firstCenter.y - secondCenter.y);
  const dx = (gapX < 0n ? -gapX : gapX) - firstWidth - secondWidth;
  const dy = (gapY < 0n ? -gapY : gapY) - firstHeight - secondHeight;
  const positiveX = dx > 0n ? dx : 0n;
  const positiveY = dy > 0n ? dy : 0n;
  return exactSquaredClass(
    {
      numerator: positiveX * positiveX + positiveY * positiveY,
      denominator: 1n,
    },
    2n * clearanceTicks
  );
}

function circleRectangleOracle(
  circleCenter: TickPoint,
  rectangleCenter: TickPoint,
  rectangleWidth: bigint,
  rectangleHeight: bigint,
  circleDiameter: bigint,
  clearanceTicks: bigint
): Class {
  return viaRectOracle(
    circleCenter,
    rectangleCenter,
    rectangleWidth,
    rectangleHeight,
    circleDiameter,
    clearanceTicks
  );
}

function viaTrackOracle(
  viaTicks: TickPoint,
  fromTicks: TickPoint,
  toTicks: TickPoint,
  viaDiameterTicks: bigint,
  trackWidthTicks: bigint,
  clearanceTicks: bigint
): Class {
  const squared = pointSegmentDistanceSquaredExact(
    doubledPoint(viaTicks),
    doubledPoint(fromTicks),
    doubledPoint(toTicks)
  );
  return exactSquaredClass(
    squared,
    viaDiameterTicks + trackWidthTicks + 2n * clearanceTicks
  );
}

function ellipseOutcome(interval: DistanceInterval, required: number): Class {
  return classifyDistanceInterval(interval, required);
}

function projectWithTrack(
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
  componentPad: ReturnType<typeof pad>,
  clearance: number,
  componentRotation = 0
) {
  return {
    ...cleanProject,
    components: [component("U1", componentPad, 0, 0, componentRotation)],
    tracks: [{ id: "T1", from, to, width, layer: "F.Cu" }],
    designRules: { ...zeroRules, trackToPadClearance: clearance },
  };
}

function projectWithViaPad(
  item: ReturnType<typeof pad>,
  via: {
    x: number;
    y: number;
    drill: number;
    diameter?: number;
    layers?: ["F.Cu", "B.Cu"];
  },
  clearance: number,
  componentRotation = 0,
  xTicks = 0,
  yTicks = 0
) {
  return {
    ...cleanProject,
    components: [component("U1", item, xTicks, yTicks, componentRotation)],
    vias: [{ id: "V1", ...via }],
    designRules: { ...zeroRules, viaToPadClearance: clearance },
  };
}

function findingFor(findings: Finding[], ruleId: string): Finding | undefined {
  return findings.find(item => item.ruleId === ruleId);
}

function compareExpected(
  actual: Class,
  expected: Class,
  id: string
): { tp: number; tn: number; fp: number; fn: number; unresolved: number } {
  if (actual === "AMBIGUOUS" || expected === "AMBIGUOUS")
    return { tp: 0, tn: 0, fp: 0, fn: 0, unresolved: 1 };
  if (expected === "VIOLATION" && actual === "VIOLATION")
    return { tp: 1, tn: 0, fp: 0, fn: 0, unresolved: 0 };
  if (expected === "CLEAR" && actual === "CLEAR")
    return { tp: 0, tn: 1, fp: 0, fn: 0, unresolved: 0 };
  if (expected === "CLEAR" && actual === "VIOLATION")
    return { tp: 0, tn: 0, fp: 1, fn: 0, unresolved: 0 };
  return { tp: 0, tn: 0, fp: 0, fn: 1, unresolved: 0 };
}

describe("Phase 5.3 independent geometry references", () => {
  describe("exact integer/rational primitive oracles", () => {
    it("computes point-to-segment projection, endpoint clamp, and degenerate cases independently", () => {
      const a = tickPoint(0, 0);
      const b = tickPoint(4, 0);
      const interior = pointSegmentDistanceSquaredExact(tickPoint(2, 3), a, b);
      const endpoint = pointSegmentDistanceSquaredExact(tickPoint(-3, 4), a, b);
      const onSegment = pointSegmentDistanceSquaredExact(tickPoint(1, 0), a, b);
      const degenerate = pointSegmentDistanceSquaredExact(
        tickPoint(4, 6),
        tickPoint(1, 2),
        tickPoint(1, 2)
      );
      expect(distanceApprox(interior)).toBe(3);
      expect(distanceApprox(endpoint)).toBe(5);
      expect(distanceApprox(onSegment)).toBe(0);
      expect(distanceApprox(degenerate)).toBe(5);
    });

    it("solves segment crossing, endpoint contact, overlap, parallel gap, and endpoint-limited separation with BigInt predicates", () => {
      expect(
        segmentsIntersectExact(
          tickPoint(0, 0),
          tickPoint(4, 0),
          tickPoint(2, -3),
          tickPoint(2, 3)
        )
      ).toBe(true);
      expect(
        segmentsIntersectExact(
          tickPoint(0, 0),
          tickPoint(2, 0),
          tickPoint(2, 0),
          tickPoint(2, 3)
        )
      ).toBe(true);
      expect(
        segmentsIntersectExact(
          tickPoint(0, 0),
          tickPoint(4, 0),
          tickPoint(2, 0),
          tickPoint(6, 0)
        )
      ).toBe(true);
      expect(
        distanceApprox(
          segmentDistanceSquaredExact(
            tickPoint(0, 0),
            tickPoint(4, 0),
            tickPoint(1, 3),
            tickPoint(5, 3)
          )
        )
      ).toBe(3);
      expect(
        distanceApprox(
          segmentDistanceSquaredExact(
            tickPoint(0, 0),
            tickPoint(4, 0),
            tickPoint(6, -2),
            tickPoint(6, 2)
          )
        )
      ).toBe(2);
      expect(
        distanceApprox(
          segmentDistanceSquaredExact(
            tickPoint(1, 2),
            tickPoint(1, 2),
            tickPoint(4, 6),
            tickPoint(4, 6)
          )
        )
      ).toBe(5);
    });

    it("establishes circle/rectangle track and via clearances using exact squared comparisons", () => {
      const center = tickPoint(0, 0);
      const trackStart = tickPoint(-3000, 1500);
      const trackEnd = tickPoint(3000, 1500);
      expect(
        circleTrackOracle(trackStart, trackEnd, center, 200n, 2000n, 200n)
      ).toBe("CLEAR");
      expect(
        circleTrackOracle(
          tickPoint(-3000, 1200),
          tickPoint(3000, 1200),
          center,
          200n,
          2000n,
          200n
        )
      ).toBe("VIOLATION");
      expect(
        rectTrackOracle(
          tickPoint(-3000, 1500),
          tickPoint(3000, 1500),
          4000n,
          2000n,
          200n,
          200n
        )
      ).toBe("CLEAR");
      expect(
        viaCircleOracle(tickPoint(3000, 0), center, 1000n, 4000n, 200n)
      ).toBe("CLEAR");
      expect(
        viaRectOracle(tickPoint(4000, 0), center, 3000n, 2000n, 1000n, 400n)
      ).toBe("CLEAR");
      expect(
        viaTrackOracle(
          tickPoint(0, 900),
          tickPoint(-5000, 0),
          tickPoint(5000, 0),
          1200n,
          200n,
          300n
        )
      ).toBe("VIOLATION");
    });
  });

  describe("track-to-pad DRC versus independent oracles", () => {
    it("matches exact circle capsule, endpoint, tangency, and threshold classifications", () => {
      const cases = [
        {
          id: "circle-clear",
          y: 1500,
          clearance: 200,
          expected: "CLEAR" as const,
        },
        {
          id: "circle-exact",
          y: 1300,
          clearance: 200,
          expected: "CLEAR" as const,
        },
        {
          id: "circle-near-inside",
          y: 1290,
          clearance: 200,
          expected: "VIOLATION" as const,
        },
        {
          id: "circle-interior-crossing",
          y: 0,
          clearance: 200,
          expected: "VIOLATION" as const,
        },
      ];
      for (const fixture of cases) {
        const expected = circleTrackOracle(
          tickPoint(-3000, fixture.y),
          tickPoint(3000, fixture.y),
          tickPoint(0, 0),
          200n,
          2000n,
          BigInt(fixture.clearance)
        );
        expect(expected, fixture.id).toBe(fixture.expected);
        const result = run(
          projectWithTrack(
            p(-3000, fixture.y),
            p(3000, fixture.y),
            world(200),
            pad("P1", 2000, 2000, "circle"),
            world(fixture.clearance)
          )
        );
        expect(
          classifyFindings(result, "PCB_TRACK_TO_PAD_CLEARANCE"),
          fixture.id
        ).toBe(expected);
        if (expected === "VIOLATION")
          expect(
            findingFor(result, "PCB_TRACK_TO_PAD_CLEARANCE")?.objectIds
          ).toEqual(["T1", "U1", "P1"]);
      }

      const endpointExpected = circleTrackOracle(
        tickPoint(1500, 0),
        tickPoint(2500, 0),
        tickPoint(0, 0),
        200n,
        2000n,
        400n
      );
      expect(endpointExpected).toBe("CLEAR");
      const endpointResult = run(
        projectWithTrack(
          p(1500, 0),
          p(2500, 0),
          world(200),
          pad("P1", 2000, 2000, "circle"),
          world(400)
        )
      );
      expect(
        classifyFindings(endpointResult, "PCB_TRACK_TO_PAD_CLEARANCE")
      ).toBe("CLEAR");
    });

    it("checks three track widths plus small, large, and short-segment circle cases", () => {
      const circle = pad("P1", 2000, 2000, "circle");
      for (const [widthTicks, expected] of [
        [200, "CLEAR"],
        [600, "CLEAR"],
        [800, "VIOLATION"],
      ] as const) {
        const oracle = circleTrackOracle(
          tickPoint(-3000, 1500),
          tickPoint(3000, 1500),
          tickPoint(0, 0),
          BigInt(widthTicks),
          2000n,
          200n
        );
        expect(oracle).toBe(expected);
        const result = run(
          projectWithTrack(
            p(-3000, 1500),
            p(3000, 1500),
            world(widthTicks),
            circle,
            world(200)
          )
        );
        expect(classifyFindings(result, "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(
          oracle
        );
      }

      const tiny = {
        ...cleanProject,
        components: [
          component("U1", { ...circle, width: 2e-12, height: 2e-12 }),
        ],
        tracks: [
          {
            id: "T1",
            from: { x: -5e-12, y: 1.5e-12 },
            to: { x: 5e-12, y: 1.5e-12 },
            width: 2e-13,
            layer: "F.Cu",
          },
        ],
        designRules: { ...zeroRules, trackToPadClearance: 2e-13 },
      };
      expect(classifyFindings(run(tiny), "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(
        "CLEAR"
      );
      const large = {
        ...cleanProject,
        board: {
          x: -1e141,
          y: -1e141,
          width: 2e141,
          height: 2e141,
          edgeClearance: 0,
        },
        components: [
          component("U1", { ...circle, width: 2e140, height: 2e140 }),
        ],
        tracks: [
          {
            id: "T1",
            from: { x: -5e140, y: 1.5e140 },
            to: { x: 5e140, y: 1.5e140 },
            width: 2e139,
            layer: "F.Cu",
          },
        ],
        designRules: { ...zeroRules, trackToPadClearance: 2e139 },
      };
      expect(classifyFindings(run(large), "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(
        "CLEAR"
      );

      const shortFrom = tickPoint(1290, 0);
      const shortTo = tickPoint(1291, 0);
      const shortExpected = circleTrackOracle(
        shortFrom,
        shortTo,
        tickPoint(0, 0),
        200n,
        2000n,
        200n
      );
      expect(shortExpected).toBe("VIOLATION");
      const shortResult = run(
        projectWithTrack(
          p(Number(shortFrom.x), Number(shortFrom.y)),
          p(Number(shortTo.x), Number(shortTo.y)),
          world(200),
          circle,
          world(200)
        )
      );
      expect(classifyFindings(shortResult, "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(
        shortExpected
      );
    });

    it("matches exact axis-aligned rectangle distances for parallel, perpendicular, and endpoint-limited tracks", () => {
      const box = pad("R1", 4000, 2000, "rect");
      const fixtures = [
        {
          from: tickPoint(-3000, 1500),
          to: tickPoint(3000, 1500),
          clearance: 200,
          expected: "CLEAR" as const,
        },
        {
          from: tickPoint(-3000, 1200),
          to: tickPoint(3000, 1200),
          clearance: 200,
          expected: "VIOLATION" as const,
        },
        {
          from: tickPoint(2500, -3000),
          to: tickPoint(2500, 3000),
          clearance: 100,
          expected: "CLEAR" as const,
        },
        {
          from: tickPoint(3000, 2000),
          to: tickPoint(4000, 2000),
          clearance: 1400,
          expected: "VIOLATION" as const,
        },
      ];
      for (const [index, fixture] of fixtures.entries()) {
        const expected = rectTrackOracle(
          fixture.from,
          fixture.to,
          4000n,
          2000n,
          200n,
          BigInt(fixture.clearance)
        );
        expect(expected, `rect-${index}`).toBe(fixture.expected);
        const result = run(
          projectWithTrack(
            p(Number(fixture.from.x), Number(fixture.from.y)),
            p(Number(fixture.to.x), Number(fixture.to.y)),
            world(200),
            box,
            world(fixture.clearance)
          )
        );
        expect(
          classifyFindings(result, "PCB_TRACK_TO_PAD_CLEARANCE"),
          `rect-${index}`
        ).toBe(expected);
      }
    });

    it("checks oval track clearance with an independent mesh interval and stated Lipschitz bound", () => {
      const ellipse = pad("E1", 8000, 4000, "oval");
      for (const [id, yTicks, clearanceTicks, expected] of [
        ["oval-parallel-clear", 2600, 200, "CLEAR"],
        ["oval-parallel-violation", 2200, 200, "VIOLATION"],
        ["oval-perpendicular-crossing", 0, 200, "VIOLATION"],
      ] as const) {
        const interval = segmentEllipseDistanceInterval(
          p(-6000, yTicks),
          p(6000, yTicks),
          p(0, 0),
          4,
          2,
          0,
          65536
        );
        const oracle = ellipseOutcome(
          interval,
          world(100) + world(clearanceTicks)
        );
        expect(oracle, id).toBe(expected);
        const result = run(
          projectWithTrack(
            p(-6000, yTicks),
            p(6000, yTicks),
            world(200),
            ellipse,
            world(clearanceTicks)
          )
        );
        expect(classifyFindings(result, "PCB_TRACK_TO_PAD_CLEARANCE"), id).toBe(
          oracle
        );
        expect(interval.lower).toBeLessThanOrEqual(interval.upper);
        expect(interval.upper - interval.lower).toBeLessThanOrEqual(
          interval.errorBound + 1e-12
        );
      }
    });
  });

  describe("track-to-track DRC versus exact segment oracle", () => {
    it("matches exact parallel, perpendicular, crossing, endpoint, and near-parallel distances", () => {
      const fixtures = [
        {
          id: "parallel-equality",
          aStart: tickPoint(-5000, 0),
          aEnd: tickPoint(5000, 0),
          bStart: tickPoint(-5000, 400),
          bEnd: tickPoint(5000, 400),
          expected: "CLEAR" as const,
        },
        {
          id: "parallel-one-tick-shortfall",
          aStart: tickPoint(-5000, 0),
          aEnd: tickPoint(5000, 0),
          bStart: tickPoint(-5000, 399),
          bEnd: tickPoint(5000, 399),
          expected: "VIOLATION" as const,
        },
        {
          id: "perpendicular-clear",
          aStart: tickPoint(-1000, 0),
          aEnd: tickPoint(1000, 0),
          bStart: tickPoint(1500, -1000),
          bEnd: tickPoint(1500, 1000),
          expected: "CLEAR" as const,
        },
        {
          id: "perpendicular-violation",
          aStart: tickPoint(-1000, 0),
          aEnd: tickPoint(1000, 0),
          bStart: tickPoint(1300, -1000),
          bEnd: tickPoint(1300, 1000),
          expected: "VIOLATION" as const,
        },
        {
          id: "crossing",
          aStart: tickPoint(-1000, 0),
          aEnd: tickPoint(1000, 0),
          bStart: tickPoint(0, -1000),
          bEnd: tickPoint(0, 1000),
          expected: "VIOLATION" as const,
        },
        {
          id: "endpoint-limited-clear",
          aStart: tickPoint(0, 0),
          aEnd: tickPoint(1000, 0),
          bStart: tickPoint(1500, 800),
          bEnd: tickPoint(1500, 1600),
          expected: "CLEAR" as const,
        },
        {
          id: "nearly-parallel-shortfall",
          aStart: tickPoint(-5000, 0),
          aEnd: tickPoint(5000, 1),
          bStart: tickPoint(-5000, 400),
          bEnd: tickPoint(5000, 401),
          expected: "VIOLATION" as const,
        },
      ];
      for (const fixture of fixtures) {
        const oracle = trackTrackOracle(
          fixture.aStart,
          fixture.aEnd,
          200n,
          fixture.bStart,
          fixture.bEnd,
          200n,
          200n
        );
        expect(oracle, `${fixture.id}-oracle`).toBe(fixture.expected);
        const result = run({
          ...cleanProject,
          tracks: [
            {
              id: "A",
              from: p(Number(fixture.aStart.x), Number(fixture.aStart.y)),
              to: p(Number(fixture.aEnd.x), Number(fixture.aEnd.y)),
              width: world(200),
              layer: "F.Cu",
            },
            {
              id: "B",
              from: p(Number(fixture.bStart.x), Number(fixture.bStart.y)),
              to: p(Number(fixture.bEnd.x), Number(fixture.bEnd.y)),
              width: world(200),
              layer: "F.Cu",
            },
          ],
          designRules: { ...zeroRules, minimumTrackClearance: world(200) },
        });
        expect(
          classifyFindings(result, "PCB_TRACK_CLEARANCE"),
          fixture.id
        ).toBe(oracle);
      }
    });
  });

  describe("via copper geometry and DRC", () => {
    it("uses via outer diameter rather than drill for circle, rectangle, and ellipse pads", () => {
      const cases = [
        {
          name: "circle",
          shape: "circle" as const,
          width: 4000,
          height: 4000,
          x: 3000,
          y: 0,
          viaDiameter: 2000,
          drill: 200,
          clearance: 50,
          oracle: viaCircleOracle(
            tickPoint(3000, 0),
            tickPoint(0, 0),
            2000n,
            4000n,
            50n
          ),
        },
        {
          name: "rect",
          shape: "rect" as const,
          width: 6000,
          height: 4000,
          x: 4000,
          y: 0,
          viaDiameter: 1000,
          drill: 200,
          clearance: 400,
          oracle: viaRectOracle(
            tickPoint(4000, 0),
            tickPoint(0, 0),
            6000n,
            4000n,
            1000n,
            400n
          ),
        },
      ];
      for (const fixture of cases) {
        const result = run(
          projectWithViaPad(
            pad("P1", fixture.width, fixture.height, fixture.shape),
            {
              x: world(fixture.x),
              y: world(fixture.y),
              drill: world(fixture.drill),
              diameter: world(fixture.viaDiameter),
              layers: ["F.Cu", "B.Cu"],
            },
            world(fixture.clearance)
          )
        );
        expect(
          classifyFindings(result, "PCB_VIA_TO_PAD_CLEARANCE"),
          fixture.name
        ).toBe(fixture.oracle);
      }
      // At center separation 3, a diameter-4 pad and diameter-2 via touch/overlap.
      // Using drill=0.2 as the via radius would instead predict a spurious 0.9 gap.
      expect(cases[0]!.oracle).toBe("VIOLATION");
    });

    it("checks via-to-oval from an independent closest-boundary interval", () => {
      const item = pad("E1", 8000, 4000, "oval");
      for (const [id, yTicks, clearanceTicks, expected] of [
        ["ellipse-via-clear", 3500, 800, "CLEAR"],
        ["ellipse-via-violation", 3200, 800, "VIOLATION"],
      ] as const) {
        const center = p(0, yTicks);
        const boundary = pointEllipseDistanceInterval(
          center,
          p(0, 0),
          4,
          2,
          0,
          65536
        );
        const viaRadius = world(500);
        const gap: DistanceInterval = {
          lower: Math.max(0, boundary.lower - viaRadius),
          upper: Math.max(0, boundary.upper - viaRadius),
          errorBound: boundary.errorBound,
          method: boundary.method,
        };
        const oracle = ellipseOutcome(gap, world(clearanceTicks));
        expect(oracle, id).toBe(expected);
        const result = run(
          projectWithViaPad(
            item,
            {
              x: 0,
              y: world(yTicks),
              drill: world(200),
              diameter: world(1000),
              layers: ["F.Cu", "B.Cu"],
            },
            world(clearanceTicks)
          )
        );
        expect(classifyFindings(result, "PCB_VIA_TO_PAD_CLEARANCE"), id).toBe(
          oracle
        );
        expect(gap.upper - gap.lower).toBeLessThanOrEqual(
          gap.errorBound + 1e-12
        );
      }
    });

    it("checks a rotated oval via case against its independent bounded point-boundary oracle", () => {
      const angle = 30;
      const ellipse = pad("E1", 8000, 4000, "oval", angle);
      for (const [id, localY, clearance, expected] of [
        ["rotated-via-clear", 3.5, 0.8, "CLEAR"],
        ["rotated-via-violation", 3.2, 0.8, "VIOLATION"],
      ] as const) {
        const viaCenter = rotatePointIndependent({ x: 0, y: localY }, angle);
        const boundary = pointEllipseDistanceInterval(
          viaCenter,
          p(0, 0),
          4,
          2,
          angle,
          131072
        );
        const gap: DistanceInterval = {
          lower: Math.max(0, boundary.lower - 0.5),
          upper: Math.max(0, boundary.upper - 0.5),
          errorBound: boundary.errorBound,
          method: boundary.method,
        };
        const oracle = ellipseOutcome(gap, clearance);
        expect(oracle, id).toBe(expected);
        const result = run(
          projectWithViaPad(
            ellipse,
            {
              x: viaCenter.x,
              y: viaCenter.y,
              drill: 0.2,
              diameter: 1,
              layers: ["F.Cu", "B.Cu"],
            },
            clearance
          )
        );
        expect(classifyFindings(result, "PCB_VIA_TO_PAD_CLEARANCE"), id).toBe(
          oracle
        );
      }
    });

    it("verifies via-to-track projection, endpoint clamping, exact equality, and layer-span applicability", () => {
      const make = (
        yTicks: number,
        clearanceTicks: number,
        trackLayer: "F.Cu" | "B.Cu" = "F.Cu",
        from = p(-5000, 0),
        to = p(5000, 0)
      ) => ({
        ...cleanProject,
        tracks: [{ id: "T1", from, to, width: world(200), layer: trackLayer }],
        vias: [
          {
            id: "V1",
            x: 0,
            y: world(yTicks),
            drill: world(200),
            diameter: world(1200),
            layers: ["F.Cu", "B.Cu"] as ["F.Cu", "B.Cu"],
          },
        ],
        designRules: {
          ...zeroRules,
          trackToViaClearance: world(clearanceTicks),
        },
      });
      for (const fixture of [
        {
          id: "parallel-clear",
          y: 1300,
          clearance: 300,
          expected: "CLEAR" as const,
          from: p(-5000, 0),
          to: p(5000, 0),
        },
        {
          id: "parallel-equal",
          y: 1000,
          clearance: 300,
          expected: "CLEAR" as const,
          from: p(-5000, 0),
          to: p(5000, 0),
        },
        {
          id: "parallel-violation",
          y: 990,
          clearance: 300,
          expected: "VIOLATION" as const,
          from: p(-5000, 0),
          to: p(5000, 0),
        },
        {
          id: "endpoint-clamped",
          y: 1500,
          clearance: 300,
          expected: "CLEAR" as const,
          from: p(-2000, 0),
          to: p(0, 0),
        },
        {
          id: "zero-length",
          y: 1000,
          clearance: 300,
          expected: "CLEAR" as const,
          from: p(0, 0),
          to: p(0, 0),
        },
      ]) {
        const expected = viaTrackOracle(
          tickPoint(0, fixture.y),
          tickPoint(
            Number(fixture.from.x) * TICKS,
            Number(fixture.from.y) * TICKS
          ),
          tickPoint(Number(fixture.to.x) * TICKS, Number(fixture.to.y) * TICKS),
          1200n,
          200n,
          BigInt(fixture.clearance)
        );
        expect(expected, fixture.id).toBe(fixture.expected);
        const result = run(
          make(fixture.y, fixture.clearance, "F.Cu", fixture.from, fixture.to)
        );
        expect(
          classifyFindings(result, "PCB_TRACK_TO_VIA_CLEARANCE"),
          fixture.id
        ).toBe(expected);
      }
      const bottomLayer = run(make(990, 300, "B.Cu"));
      expect(classifyFindings(bottomLayer, "PCB_TRACK_TO_VIA_CLEARANCE")).toBe(
        "VIOLATION"
      );
      const unavailableSpan = run({
        ...make(0, 300),
        vias: [
          { id: "V1", x: 0, y: 0, drill: world(200), diameter: world(1200) },
        ],
      });
      expect(
        classifyFindings(unavailableSpan, "PCB_TRACK_TO_VIA_CLEARANCE")
      ).toBe("CLEAR");
      expect(
        findingFor(unavailableSpan, "PCB_VIA_LAYER_SPAN_UNAVAILABLE")?.severity
      ).toBe("Info");
      expect(
        findingFor(unavailableSpan, "PCB_GEOMETRY_INDETERMINATE")
      ).toBeUndefined();
      const distinctHoleAndCopper = run({
        ...make(800, 300),
        vias: [
          {
            id: "V1",
            x: 0,
            y: world(800),
            drill: world(200),
            diameter: world(1200),
            layers: ["F.Cu", "B.Cu"],
          },
        ],
      });
      expect(
        classifyFindings(distinctHoleAndCopper, "PCB_TRACK_TO_VIA_CLEARANCE")
      ).toBe("VIOLATION");

      for (const fixture of [
        {
          id: "wide-track-equal",
          x: 1750,
          width: 1000,
          diameter: 2000,
          clearance: 250,
          expected: "CLEAR" as const,
        },
        {
          id: "wide-track-shortfall",
          x: 1740,
          width: 1000,
          diameter: 2000,
          clearance: 250,
          expected: "VIOLATION" as const,
        },
        {
          id: "small-copper-clear",
          x: 800,
          width: 200,
          diameter: 1000,
          clearance: 100,
          expected: "CLEAR" as const,
        },
        {
          id: "small-copper-violation",
          x: 690,
          width: 200,
          diameter: 1000,
          clearance: 100,
          expected: "VIOLATION" as const,
        },
      ]) {
        const start = tickPoint(fixture.x, -5000);
        const end = tickPoint(fixture.x, 5000);
        const expected = viaTrackOracle(
          tickPoint(0, 0),
          start,
          end,
          BigInt(fixture.diameter),
          BigInt(fixture.width),
          BigInt(fixture.clearance)
        );
        expect(expected, fixture.id).toBe(fixture.expected);
        const result = run({
          ...cleanProject,
          tracks: [
            {
              id: "T",
              from: p(fixture.x, -5000),
              to: p(fixture.x, 5000),
              width: world(fixture.width),
              layer: "F.Cu",
            },
          ],
          vias: [
            {
              id: "V",
              x: 0,
              y: 0,
              drill: world(200),
              diameter: world(fixture.diameter),
              layers: ["F.Cu", "B.Cu"],
            },
          ],
          designRules: {
            ...zeroRules,
            trackToViaClearance: world(fixture.clearance),
          },
        });
        expect(
          classifyFindings(result, "PCB_TRACK_TO_VIA_CLEARANCE"),
          fixture.id
        ).toBe(expected);
      }
    });
  });

  describe("pad-pair clearance and GJK against analytic references", () => {
    const pairProject = (
      first: ReturnType<typeof pad>,
      firstCenter: TickPoint,
      second: ReturnType<typeof pad>,
      secondCenter: TickPoint,
      clearanceTicks: number
    ) => ({
      ...cleanProject,
      components: [
        component("U1", first, Number(firstCenter.x), Number(firstCenter.y)),
        component("U2", second, Number(secondCenter.x), Number(secondCenter.y)),
      ],
      designRules: {
        ...zeroRules,
        padToPadClearance: world(clearanceTicks),
      },
    });

    it("matches exact circle, rectangle, and common-axis ellipse references for every shape dispatch", () => {
      const origin = tickPoint(0, 0);
      const cases = [
        {
          id: "circle-circle",
          first: pad("A", 4000, 4000, "circle"),
          firstCenter: origin,
          second: pad("B", 4000, 4000, "circle"),
          secondCenter: tickPoint(5000, 0),
          clear: 800,
          violation: 1200,
          oracle: (clearance: number) =>
            viaCircleOracle(
              tickPoint(5000, 0),
              origin,
              4000n,
              4000n,
              BigInt(clearance)
            ),
        },
        {
          id: "rectangle-rectangle",
          first: pad("A", 4000, 2000, "rect"),
          firstCenter: origin,
          second: pad("B", 4000, 2000, "rect"),
          secondCenter: tickPoint(0, 4000),
          clear: 1500,
          violation: 2500,
          oracle: (clearance: number) =>
            rectanglePairOracle(
              origin,
              4000n,
              2000n,
              tickPoint(0, 4000),
              4000n,
              2000n,
              BigInt(clearance)
            ),
        },
        {
          id: "ellipse-ellipse",
          first: pad("A", 8000, 4000, "oval"),
          firstCenter: origin,
          second: pad("B", 8000, 4000, "oval"),
          secondCenter: tickPoint(0, 5000),
          clear: 800,
          violation: 1200,
          oracle: (clearance: number) =>
            axisGapOracle(2n * 5000n - 4000n - 4000n, BigInt(clearance)),
        },
        {
          id: "rectangle-ellipse",
          first: pad("A", 4000, 2000, "rect"),
          firstCenter: origin,
          second: pad("B", 6000, 4000, "oval"),
          secondCenter: tickPoint(0, 4000),
          clear: 800,
          violation: 1200,
          oracle: (clearance: number) =>
            axisGapOracle(2n * 4000n - 2000n - 4000n, BigInt(clearance)),
        },
        {
          id: "ellipse-rectangle",
          first: pad("A", 6000, 4000, "oval"),
          firstCenter: origin,
          second: pad("B", 4000, 2000, "rect"),
          secondCenter: tickPoint(0, 4000),
          clear: 800,
          violation: 1200,
          oracle: (clearance: number) =>
            axisGapOracle(2n * 4000n - 4000n - 2000n, BigInt(clearance)),
        },
        {
          id: "circle-rectangle",
          first: pad("A", 2000, 2000, "circle"),
          firstCenter: tickPoint(0, 2500),
          second: pad("B", 4000, 2000, "rect"),
          secondCenter: origin,
          clear: 400,
          violation: 600,
          oracle: (clearance: number) =>
            circleRectangleOracle(
              tickPoint(0, 2500),
              origin,
              4000n,
              2000n,
              2000n,
              BigInt(clearance)
            ),
        },
        {
          id: "rectangle-circle",
          first: pad("A", 4000, 2000, "rect"),
          firstCenter: origin,
          second: pad("B", 2000, 2000, "circle"),
          secondCenter: tickPoint(0, 2500),
          clear: 400,
          violation: 600,
          oracle: (clearance: number) =>
            circleRectangleOracle(
              tickPoint(0, 2500),
              origin,
              4000n,
              2000n,
              2000n,
              BigInt(clearance)
            ),
        },
        {
          id: "circle-ellipse",
          first: pad("A", 2000, 2000, "circle"),
          firstCenter: tickPoint(0, 3500),
          second: pad("B", 8000, 4000, "oval"),
          secondCenter: origin,
          clear: 400,
          violation: 600,
          oracle: (clearance: number) =>
            axisGapOracle(2n * 3500n - 4000n - 2000n, BigInt(clearance)),
        },
        {
          id: "ellipse-circle",
          first: pad("A", 8000, 4000, "oval"),
          firstCenter: origin,
          second: pad("B", 2000, 2000, "circle"),
          secondCenter: tickPoint(0, 3500),
          clear: 400,
          violation: 600,
          oracle: (clearance: number) =>
            axisGapOracle(2n * 3500n - 4000n - 2000n, BigInt(clearance)),
        },
      ];

      for (const fixture of cases) {
        for (const clearanceTicks of [fixture.clear, fixture.violation]) {
          const expected = fixture.oracle(clearanceTicks);
          const expectedLabel =
            clearanceTicks === fixture.clear ? "CLEAR" : "VIOLATION";
          expect(expected, `${fixture.id}-oracle-${clearanceTicks}`).toBe(
            expectedLabel
          );
          for (const reverse of [false, true]) {
            const input = reverse
              ? pairProject(
                  fixture.second,
                  fixture.secondCenter,
                  fixture.first,
                  fixture.firstCenter,
                  clearanceTicks
                )
              : pairProject(
                  fixture.first,
                  fixture.firstCenter,
                  fixture.second,
                  fixture.secondCenter,
                  clearanceTicks
                );
            const result = run(input);
            expect(
              classifyFindings(result, "PCB_PAD_TO_PAD_CLEARANCE"),
              `${fixture.id}-${reverse}-${clearanceTicks}`
            ).toBe(expected);
          }
        }
      }
    });

    it("checks eccentric common-axis GJK separation, tangency, overlap, and rotated pairs", () => {
      const angles = [0, 15, 30, 45, 60, 90, -31, 123.456];
      const centerGap = 3;
      const exactClearance = axisGapOracle(2n * 3000n - 2000n - 2000n, 750n);
      const exactViolation = axisGapOracle(2n * 3000n - 2000n - 2000n, 1250n);
      expect(exactClearance).toBe("CLEAR");
      expect(exactViolation).toBe("VIOLATION");
      for (const angle of angles) {
        const secondCenterFloat = rotatePointIndependent(
          { x: 0, y: centerGap },
          angle
        );
        const first = pad("A", 20_000, 2000, "oval", angle);
        const second = pad("B", 20_000, 2000, "oval", angle);
        const pair = (clearance: number) => ({
          ...cleanProject,
          components: [
            component("U1", first),
            {
              ...component("U2", second),
              x: secondCenterFloat.x,
              y: secondCenterFloat.y,
            },
          ],
          designRules: { ...zeroRules, padToPadClearance: clearance },
        });
        const clearInput = pair(0.75);
        const clearFinding = run(clearInput);
        expect(
          classifyFindings(clearFinding, "PCB_PAD_TO_PAD_CLEARANCE"),
          `ellipse-clear-${angle}`
        ).toBe("CLEAR");
        const detail = padToPadDistanceDetailed(
          { ...first, position: { x: 0, y: 0 } },
          { ...second, position: secondCenterFloat }
        );
        expect(detail.state, `ellipse-convergence-${angle}`).toBe("CONVERGED");
        if (detail.state === "CONVERGED")
          expect(detail.distance, `ellipse-distance-${angle}`).toBeCloseTo(
            1,
            6
          );
        expect(
          classifyFindings(run(pair(1.25)), "PCB_PAD_TO_PAD_CLEARANCE"),
          `ellipse-violation-${angle}`
        ).toBe("VIOLATION");

        const touchingCenter = rotatePointIndependent({ x: 0, y: 2 }, angle);
        const touching = run({
          ...cleanProject,
          components: [
            component("U1", first),
            {
              ...component("U2", second),
              x: touchingCenter.x,
              y: touchingCenter.y,
            },
          ],
          designRules: { ...zeroRules, padToPadClearance: 0 },
        });
        expect(
          classifyFindings(touching, "PCB_PAD_TO_PAD_CLEARANCE"),
          `ellipse-tangent-${angle}`
        ).toBe("CLEAR");
      }
    });

    it("checks mixed rotated-ellipse and unrotated-rectangle distance with a bounded independent mesh", () => {
      const ellipseRotation = 30;
      const ellipseCenter = { x: 0, y: 6 };
      const interval = ellipseRectangleDistanceInterval(
        ellipseCenter,
        4,
        2,
        ellipseRotation,
        { left: -2, top: -1, right: 2, bottom: 1 },
        131072
      );
      expect(interval.lower).toBeLessThanOrEqual(interval.upper);
      expect(interval.upper - interval.lower).toBeLessThanOrEqual(
        interval.errorBound + 1e-12
      );
      const oracle = ellipseOutcome(interval, 2.2);
      expect(oracle).toBe("CLEAR");
      const rectangle = pad("R1", 4000, 2000, "rect");
      const ellipse = pad("E1", 8000, 4000, "oval", ellipseRotation);
      const project = (clearance: number, reverse = false) => ({
        ...cleanProject,
        components: reverse
          ? [
              {
                ...component("U1", ellipse),
                x: ellipseCenter.x,
                y: ellipseCenter.y,
              },
              component("U2", rectangle),
            ]
          : [
              component("U1", rectangle),
              {
                ...component("U2", ellipse),
                x: ellipseCenter.x,
                y: ellipseCenter.y,
              },
            ],
        designRules: { ...zeroRules, padToPadClearance: clearance },
      });
      expect(
        classifyFindings(run(project(2.2)), "PCB_PAD_TO_PAD_CLEARANCE")
      ).toBe(oracle);
      const violation = ellipseOutcome(interval, 2.5);
      expect(violation).toBe("VIOLATION");
      expect(
        classifyFindings(run(project(2.5, true)), "PCB_PAD_TO_PAD_CLEARANCE")
      ).toBe(violation);
    });
  });

  describe("rotated geometry and metamorphic invariants", () => {
    const seedAngles = (): number[] => {
      let state = 0x5eed1234;
      const values: number[] = [];
      for (let i = 0; i < 8; i += 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        values.push((state / 0x1_0000_0000) * 360 - 180);
      }
      return values;
    };

    it("preserves independent rectangle and ellipse classifications at specified and seeded angles", () => {
      const angles = [0, 15, 30, 45, 60, 90, ...seedAngles()];
      for (const shape of ["rect", "oval"] as const) {
        for (const angle of angles) {
          for (const [id, localY, expected] of [
            ["clear", shape === "rect" ? 2.8 : 2.8, "CLEAR"],
            ["violation", 2.3, "VIOLATION"],
          ] as const) {
            const fromLocal = { x: -8000 / TICKS, y: localY };
            const toLocal = { x: 8000 / TICKS, y: localY };
            const from = rotatePointIndependent(fromLocal, angle);
            const to = rotatePointIndependent(toLocal, angle);
            const result = run(
              projectWithTrack(
                from,
                to,
                world(200),
                pad("P1", 6000, 4000, shape, angle),
                world(300)
              )
            );
            expect(
              classifyFindings(result, "PCB_TRACK_TO_PAD_CLEARANCE"),
              `${shape}-${id}-angle-${angle}`
            ).toBe(expected);
          }
        }
      }
    });

    it("checks rotated ellipse major-axis clearance and rotated rectangle corner cases", () => {
      const angles = [0, 15, 30, 45, 60, 90, ...seedAngles()];
      for (const angle of angles) {
        for (const [id, localX, expected] of [
          ["major-clear", 4.8, "CLEAR"],
          ["major-violation", 4.3, "VIOLATION"],
        ] as const) {
          const localFrom = { x: localX, y: -6 };
          const localTo = { x: localX, y: 6 };
          const from = rotatePointIndependent(localFrom, angle);
          const to = rotatePointIndependent(localTo, angle);
          const interval = segmentEllipseDistanceInterval(
            from,
            to,
            p(0, 0),
            4,
            2,
            angle,
            65536
          );
          const oracle = ellipseOutcome(interval, 0.4);
          expect(oracle, `${id}-oracle-${angle}`).toBe(expected);
          const result = run(
            projectWithTrack(
              from,
              to,
              0.2,
              pad("E", 8000, 4000, "oval", angle),
              0.3
            )
          );
          expect(
            classifyFindings(result, "PCB_TRACK_TO_PAD_CLEARANCE"),
            `${id}-${angle}`
          ).toBe(oracle);
        }

        for (const [id, start, expected] of [
          ["corner-clear", tickPoint(2800, 2800), "CLEAR"],
          ["corner-violation", tickPoint(2200, 2200), "VIOLATION"],
        ] as const) {
          const end = tickPoint(5000, 5000);
          const oracle = rectTrackOracle(start, end, 6000n, 4000n, 200n, 300n);
          expect(oracle, `${id}-oracle-${angle}`).toBe(expected);
          const from = rotatePointIndependent(
            { x: Number(start.x) / TICKS, y: Number(start.y) / TICKS },
            angle
          );
          const to = rotatePointIndependent(
            { x: Number(end.x) / TICKS, y: Number(end.y) / TICKS },
            angle
          );
          const result = run(
            projectWithTrack(
              from,
              to,
              0.2,
              pad("R", 6000, 4000, "rect", angle),
              0.3
            )
          );
          expect(
            classifyFindings(result, "PCB_TRACK_TO_PAD_CLEARANCE"),
            `${id}-${angle}`
          ).toBe(oracle);
        }
      }
    });

    it("validates component-plus-pad rotation from independently transformed local coordinates", () => {
      const componentAngle = 23;
      const localPadAngle = 38;
      const origin = { x: 12, y: 14 };
      const localCenter = { x: 3, y: -2 };
      const rotatedCenter = rotatePointIndependent(localCenter, componentAngle);
      const padCenter = {
        x: origin.x + rotatedCenter.x,
        y: origin.y + rotatedCenter.y,
      };
      const fullAngle = componentAngle + localPadAngle;
      const localFrom = rotatePointIndependent({ x: -7, y: 2.3 }, fullAngle);
      const localTo = rotatePointIndependent({ x: 7, y: 2.3 }, fullAngle);
      const project = {
        ...cleanProject,
        components: [
          {
            id: "U1",
            ref: "U1",
            x: origin.x,
            y: origin.y,
            rotation: componentAngle,
            footprintGeometry: {
              identifier: "FP",
              pads: [pad("R1", 6000, 4000, "rect", localPadAngle, 3000, -2000)],
            },
          },
        ],
        tracks: [
          {
            id: "T1",
            from: {
              x: padCenter.x + localFrom.x,
              y: padCenter.y + localFrom.y,
            },
            to: { x: padCenter.x + localTo.x, y: padCenter.y + localTo.y },
            width: world(200),
            layer: "F.Cu",
          },
        ],
        designRules: { ...zeroRules, trackToPadClearance: world(300) },
      };
      const findings = run(project);
      expect(classifyFindings(findings, "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(
        "VIOLATION"
      );
      expect(
        findingFor(findings, "PCB_TRACK_TO_PAD_CLEARANCE")?.objectIds
      ).toEqual(["T1", "U1", "R1"]);
    });

    it("preserves DRC classification under translation, reflection, endpoint reversal, and input permutation", () => {
      const base = {
        ...cleanProject,
        tracks: [
          {
            id: "T1",
            from: p(-4000, 0),
            to: p(4000, 0),
            width: world(200),
            layer: "F.Cu",
          },
          {
            id: "T2",
            from: p(-4000, 700),
            to: p(4000, 700),
            width: world(200),
            layer: "F.Cu",
          },
        ],
        designRules: { ...zeroRules, minimumTrackClearance: world(600) },
      };
      const classify = (project: unknown) =>
        run(project)
          .filter(
            f =>
              f.ruleId === "PCB_TRACK_CLEARANCE" ||
              f.ruleId === "PCB_GEOMETRY_INDETERMINATE"
          )
          .map(f => `${f.ruleId}:${[...f.objectIds].sort().join(",")}`)
          .sort();
      const expected = classify(base);
      expect(expected).toEqual(["PCB_TRACK_CLEARANCE:T1,T2"]);
      const translate = (dx: number, dy: number) => ({
        ...base,
        board: {
          x: farBoard.x + dx,
          y: farBoard.y + dy,
          width: farBoard.width,
          height: farBoard.height,
          edgeClearance: 0,
        },
        tracks: base.tracks.map(t => ({
          ...t,
          from: { x: t.from.x + dx, y: t.from.y + dy },
          to: { x: t.to.x + dx, y: t.to.y + dy },
        })),
      });
      expect(classify(translate(1e9, -1e9))).toEqual(expected);
      const reflected = {
        ...base,
        tracks: base.tracks.map(t => ({
          ...t,
          from: { x: -t.from.x, y: t.from.y },
          to: { x: -t.to.x, y: t.to.y },
        })),
      };
      expect(classify(reflected)).toEqual(expected);
      const reversed = {
        ...base,
        tracks: base.tracks.map(t => ({ ...t, from: t.to, to: t.from })),
      };
      expect(classify(reversed)).toEqual(expected);
      const permuted = { ...base, tracks: [...base.tracks].reverse() };
      expect(classify(permuted)).toEqual(expected);
      const firstTranslation = translate(12.25, -8.5);
      const restored = {
        ...firstTranslation,
        board: { ...base.board },
        tracks: firstTranslation.tracks.map(t => ({
          ...t,
          from: { x: t.from.x - 12.25, y: t.from.y + 8.5 },
          to: { x: t.to.x - 12.25, y: t.to.y + 8.5 },
        })),
      };
      expect(classify(restored)).toEqual(expected);
      expect(restored.tracks[0]!.from).toEqual(base.tracks[0]!.from);
      expect(restored.tracks[1]!.to.y).toBeCloseTo(base.tracks[1]!.to.y, 14);
      expect(JSON.stringify(run(base))).toBe(JSON.stringify(run(base)));
    });

    it("preserves interior DRC classification under rigid rotation and uniform scaling", () => {
      const base = {
        ...cleanProject,
        tracks: [
          {
            id: "T1",
            from: p(-5000, 0),
            to: p(5000, 0),
            width: world(200),
            layer: "F.Cu",
          },
        ],
        vias: [
          {
            id: "V1",
            x: 0,
            y: world(1200),
            drill: world(200),
            diameter: world(1200),
            layers: ["F.Cu", "B.Cu"] as ["F.Cu", "B.Cu"],
          },
        ],
        designRules: { ...zeroRules, trackToViaClearance: world(300) },
      };
      const normalized = (project: unknown) =>
        run(project)
          .filter(
            f =>
              f.ruleId === "PCB_TRACK_TO_VIA_CLEARANCE" ||
              f.ruleId === "PCB_GEOMETRY_INDETERMINATE"
          )
          .map(f => f.ruleId)
          .sort();
      const expected = normalized(base);
      expect(expected).toEqual([]);
      const angle = 37;
      const rotated = {
        ...base,
        tracks: base.tracks.map(t => ({
          ...t,
          from: rotatePointIndependent(t.from, angle),
          to: rotatePointIndependent(t.to, angle),
        })),
        vias: base.vias.map(v => {
          const q = rotatePointIndependent({ x: v.x, y: v.y }, angle);
          return { ...v, x: q.x, y: q.y };
        }),
      };
      expect(normalized(rotated)).toEqual(expected);
      const factor = 25;
      const scaled = {
        ...base,
        board: {
          x: farBoard.x * factor,
          y: farBoard.y * factor,
          width: farBoard.width * factor,
          height: farBoard.height * factor,
          edgeClearance: 0,
        },
        tracks: base.tracks.map(t => ({
          ...t,
          from: { x: t.from.x * factor, y: t.from.y * factor },
          to: { x: t.to.x * factor, y: t.to.y * factor },
          width: t.width * factor,
        })),
        vias: base.vias.map(v => ({
          ...v,
          x: v.x * factor,
          y: v.y * factor,
          drill: v.drill * factor,
          diameter: v.diameter! * factor,
        })),
        designRules: {
          ...base.designRules,
          trackToViaClearance: base.designRules.trackToViaClearance * factor,
        },
      };
      expect(normalized(scaled)).toEqual(expected);

      const rotate = (project: typeof base, degrees: number) => ({
        ...project,
        tracks: project.tracks.map(t => ({
          ...t,
          from: rotatePointIndependent(t.from, degrees),
          to: rotatePointIndependent(t.to, degrees),
        })),
        vias: project.vias.map(v => {
          const q = rotatePointIndependent({ x: v.x, y: v.y }, degrees);
          return { ...v, x: q.x, y: q.y };
        }),
      });
      const afterTurn = rotate(rotate(base, 17), -17);
      expect(normalized(afterTurn)).toEqual(expected);
      const repeatedTurn = Array.from({ length: 36 }).reduce(
        (project, _unused) => rotate(project as typeof base, 10),
        base as typeof base
      );
      expect(normalized(repeatedTurn)).toEqual(expected);
    });
  });

  describe("board-edge containment and edge-clearance semantics", () => {
    const board = { x: 0, y: 0, width: 100, height: 80, edgeClearance: 5 };

    it("checks exact inset, outside copper, and board containment separately for tracks, vias, and pads", () => {
      const atEdgeTrack = {
        ...cleanProject,
        board,
        tracks: [
          {
            id: "T",
            from: { x: 6, y: 20 },
            to: { x: 20, y: 20 },
            width: 2,
            layer: "F.Cu",
          },
        ],
        designRules: { ...zeroRules, copperToEdgeClearance: 5 },
      };
      const outsideTrack = {
        ...atEdgeTrack,
        tracks: [{ ...atEdgeTrack.tracks[0], from: { x: 5.9, y: 20 } }],
      };
      expect(
        run(atEdgeTrack).some(f => f.ruleId === "PCB_EDGE_CLEARANCE")
      ).toBe(false);
      expect(
        run(outsideTrack).some(f => f.ruleId === "PCB_EDGE_CLEARANCE")
      ).toBe(true);
      const atEdgeVia = {
        ...cleanProject,
        board,
        vias: [{ id: "V", x: 6, y: 20, drill: 0.5, diameter: 2 }],
        designRules: { ...zeroRules, copperToEdgeClearance: 5 },
      };
      const outsideVia = {
        ...atEdgeVia,
        vias: [{ ...atEdgeVia.vias[0], x: 5.9 }],
      };
      expect(
        run(atEdgeVia).some(f => f.ruleId === "PCB_VIA_EDGE_CLEARANCE")
      ).toBe(false);
      expect(
        run(outsideVia).some(f => f.ruleId === "PCB_VIA_EDGE_CLEARANCE")
      ).toBe(true);
      const circle = pad("P", 2000, 2000, "circle");
      const atEdgePad = {
        ...cleanProject,
        board,
        components: [component("U", circle, 6000, 20000)],
        designRules: { ...zeroRules, copperToEdgeClearance: 5 },
      };
      const outsidePad = {
        ...atEdgePad,
        components: [component("U", circle, 5900, 20000)],
      };
      expect(
        run(atEdgePad).some(f => f.ruleId === "PCB_PAD_EDGE_CLEARANCE")
      ).toBe(false);
      expect(
        run(outsidePad).some(f => f.ruleId === "PCB_PAD_EDGE_CLEARANCE")
      ).toBe(true);
      const noClearanceButOutside = {
        ...outsidePad,
        designRules: { ...zeroRules, copperToEdgeClearance: 0 },
        components: [component("U", circle, -500, 20000)],
      };
      expect(
        run(noClearanceButOutside).some(
          f => f.ruleId === "PCB_PAD_EDGE_CLEARANCE"
        )
      ).toBe(true);

      const touchingTrack = {
        ...cleanProject,
        board: { ...board, edgeClearance: 0 },
        tracks: [
          {
            id: "T",
            from: { x: 1, y: 20 },
            to: { x: 20, y: 20 },
            width: 2,
            layer: "F.Cu",
          },
        ],
        designRules: { ...zeroRules, copperToEdgeClearance: 0 },
      };
      expect(
        run(touchingTrack).some(f => f.ruleId === "PCB_EDGE_CLEARANCE")
      ).toBe(false);
      expect(
        run({
          ...touchingTrack,
          tracks: [{ ...touchingTrack.tracks[0], from: { x: 0.999, y: 20 } }],
        }).some(f => f.ruleId === "PCB_EDGE_CLEARANCE")
      ).toBe(true);

      const touchingVia = {
        ...cleanProject,
        board: { ...board, edgeClearance: 0 },
        vias: [
          {
            id: "V",
            x: 1,
            y: 20,
            drill: 0.2,
            diameter: 2,
            layers: ["F.Cu", "B.Cu"],
          },
        ],
        designRules: { ...zeroRules, copperToEdgeClearance: 0 },
      };
      expect(
        run(touchingVia).some(f => f.ruleId === "PCB_VIA_EDGE_CLEARANCE")
      ).toBe(false);
      expect(
        run({
          ...touchingVia,
          vias: [{ ...touchingVia.vias[0], x: 0.999 }],
        }).some(f => f.ruleId === "PCB_VIA_EDGE_CLEARANCE")
      ).toBe(true);

      const touchingPad = {
        ...cleanProject,
        board: { ...board, edgeClearance: 0 },
        components: [component("U", circle, 1000, 20000)],
        designRules: { ...zeroRules, copperToEdgeClearance: 0 },
      };
      expect(
        run(touchingPad).some(f => f.ruleId === "PCB_PAD_EDGE_CLEARANCE")
      ).toBe(false);
      expect(
        run({
          ...touchingPad,
          components: [component("U", circle, 999, 20000)],
        }).some(f => f.ruleId === "PCB_PAD_EDGE_CLEARANCE")
      ).toBe(true);
    });

    it("applies independent rotated-rectangle and ellipse support extents at all four sides", () => {
      const angles = [15, 30, 45, 60, 90];
      for (const shape of ["rect", "oval"] as const) {
        for (const angle of angles) {
          const width = 8;
          const height = 2;
          const c = Math.abs(Math.cos((angle * Math.PI) / 180));
          const s = Math.abs(Math.sin((angle * Math.PI) / 180));
          const halfX =
            shape === "rect"
              ? (width * c + height * s) / 2
              : Math.hypot((width * c) / 2, (height * s) / 2);
          const halfY =
            shape === "rect"
              ? (width * s + height * c) / 2
              : Math.hypot((width * s) / 2, (height * c) / 2);
          const places = [
            { x: 5 + halfX + 0.2, y: 40 },
            { x: 95 - halfX - 0.2, y: 40 },
            { x: 50, y: 5 + halfY + 0.2 },
            { x: 50, y: 75 - halfY - 0.2 },
          ];
          for (const [index, center] of places.entries()) {
            const item = {
              ...pad("P", 8000, 2000, shape, angle),
              position: { x: 0, y: 0 },
            };
            const project = {
              ...cleanProject,
              board,
              components: [
                { ...component("U", item), x: center.x, y: center.y },
              ],
              designRules: { ...zeroRules, copperToEdgeClearance: 5 },
            };
            const findings = run(project);
            expect(
              findings.some(f => f.ruleId === "PCB_PAD_EDGE_CLEARANCE"),
              `${shape}-${angle}-side${index}`
            ).toBe(false);
          }
        }
      }
    });
  });

  describe("deterministic FP/FN audit", () => {
    it("accounts for every unambiguous independent fixture without hiding ambiguous outcomes", () => {
      const fixtures: Array<{ id: string; expected: Class; actual: Class }> =
        [];
      const add = (id: string, expected: Class, actual: Class) =>
        fixtures.push({ id, expected, actual });

      const circleExpected = circleTrackOracle(
        tickPoint(-3000, 1200),
        tickPoint(3000, 1200),
        tickPoint(0, 0),
        200n,
        2000n,
        200n
      );
      const circleActual = classifyFindings(
        run(
          projectWithTrack(
            p(-3000, 1200),
            p(3000, 1200),
            world(200),
            pad("P", 2000, 2000, "circle"),
            world(200)
          )
        ),
        "PCB_TRACK_TO_PAD_CLEARANCE"
      );
      add("track-circle-known-violation", circleExpected, circleActual);

      const rectExpected = rectTrackOracle(
        tickPoint(-3000, 1500),
        tickPoint(3000, 1500),
        4000n,
        2000n,
        200n,
        100n
      );
      const rectActual = classifyFindings(
        run(
          projectWithTrack(
            p(-3000, 1500),
            p(3000, 1500),
            world(200),
            pad("P", 4000, 2000),
            world(100)
          )
        ),
        "PCB_TRACK_TO_PAD_CLEARANCE"
      );
      add("track-rect-known-clear", rectExpected, rectActual);

      const viaExpected = viaTrackOracle(
        tickPoint(0, 900),
        tickPoint(-5000, 0),
        tickPoint(5000, 0),
        1200n,
        200n,
        300n
      );
      const viaActual = classifyFindings(
        run({
          ...cleanProject,
          tracks: [
            {
              id: "T",
              from: p(-5000, 0),
              to: p(5000, 0),
              width: world(200),
              layer: "F.Cu",
            },
          ],
          vias: [
            {
              id: "V",
              x: 0,
              y: world(900),
              drill: world(200),
              diameter: world(1200),
              layers: ["F.Cu", "B.Cu"],
            },
          ],
          designRules: { ...zeroRules, trackToViaClearance: world(300) },
        }),
        "PCB_TRACK_TO_VIA_CLEARANCE"
      );
      add("via-track-known-violation", viaExpected, viaActual);

      const ellipseInterval = segmentEllipseDistanceInterval(
        p(-6000, 2600),
        p(6000, 2600),
        p(0, 0),
        4,
        2,
        0,
        65536
      );
      const ellipseExpected = ellipseOutcome(
        ellipseInterval,
        world(100) + world(200)
      );
      const ellipseActual = classifyFindings(
        run(
          projectWithTrack(
            p(-6000, 2600),
            p(6000, 2600),
            world(200),
            pad("E", 8000, 4000, "oval"),
            world(200)
          )
        ),
        "PCB_TRACK_TO_PAD_CLEARANCE"
      );
      add("track-ellipse-known-clear", ellipseExpected, ellipseActual);

      const circleClearExpected = circleTrackOracle(
        tickPoint(-3000, 1500),
        tickPoint(3000, 1500),
        tickPoint(0, 0),
        200n,
        2000n,
        200n
      );
      const circleClearActual = classifyFindings(
        run(
          projectWithTrack(
            p(-3000, 1500),
            p(3000, 1500),
            world(200),
            pad("P", 2000, 2000, "circle"),
            world(200)
          )
        ),
        "PCB_TRACK_TO_PAD_CLEARANCE"
      );
      add("track-circle-known-clear", circleClearExpected, circleClearActual);

      const circleEqualExpected = circleTrackOracle(
        tickPoint(-3000, 1300),
        tickPoint(3000, 1300),
        tickPoint(0, 0),
        200n,
        2000n,
        200n
      );
      const circleEqualActual = classifyFindings(
        run(
          projectWithTrack(
            p(-3000, 1300),
            p(3000, 1300),
            world(200),
            pad("P", 2000, 2000, "circle"),
            world(200)
          )
        ),
        "PCB_TRACK_TO_PAD_CLEARANCE"
      );
      add(
        "track-circle-exact-clearance-equality",
        circleEqualExpected,
        circleEqualActual
      );

      const rectViolationExpected = rectTrackOracle(
        tickPoint(-3000, 1150),
        tickPoint(3000, 1150),
        4000n,
        2000n,
        200n,
        100n
      );
      const rectViolationActual = classifyFindings(
        run(
          projectWithTrack(
            p(-3000, 1150),
            p(3000, 1150),
            world(200),
            pad("P", 4000, 2000),
            world(100)
          )
        ),
        "PCB_TRACK_TO_PAD_CLEARANCE"
      );
      add(
        "track-rect-near-threshold-violation",
        rectViolationExpected,
        rectViolationActual
      );

      const ellipseViolationInterval = segmentEllipseDistanceInterval(
        p(-6000, 2200),
        p(6000, 2200),
        p(0, 0),
        4,
        2,
        0,
        65536
      );
      const ellipseViolationExpected = ellipseOutcome(
        ellipseViolationInterval,
        0.3
      );
      const ellipseViolationActual = classifyFindings(
        run(
          projectWithTrack(
            p(-6000, 2200),
            p(6000, 2200),
            world(200),
            pad("E", 8000, 4000, "oval"),
            world(200)
          )
        ),
        "PCB_TRACK_TO_PAD_CLEARANCE"
      );
      add(
        "track-ellipse-known-violation",
        ellipseViolationExpected,
        ellipseViolationActual
      );

      for (const [id, yTicks, expected] of [
        ["via-track-known-clear", 1300, "CLEAR"],
        ["via-track-equality-clear", 1000, "CLEAR"],
      ] as const) {
        const expectedClass = viaTrackOracle(
          tickPoint(0, yTicks),
          tickPoint(-5000, 0),
          tickPoint(5000, 0),
          1200n,
          200n,
          300n
        );
        const actualClass = classifyFindings(
          run({
            ...cleanProject,
            tracks: [
              {
                id: "T",
                from: p(-5000, 0),
                to: p(5000, 0),
                width: world(200),
                layer: "F.Cu",
              },
            ],
            vias: [
              {
                id: "V",
                x: 0,
                y: world(yTicks),
                drill: world(200),
                diameter: world(1200),
                layers: ["F.Cu", "B.Cu"],
              },
            ],
            designRules: { ...zeroRules, trackToViaClearance: world(300) },
          }),
          "PCB_TRACK_TO_VIA_CLEARANCE"
        );
        expect(expectedClass).toBe(expected);
        add(id, expectedClass, actualClass);
      }

      for (const [id, clearance, expected] of [
        ["pad-circle-known-clear", 800, "CLEAR"],
        ["pad-circle-known-violation", 1200, "VIOLATION"],
      ] as const) {
        const oracle = viaCircleOracle(
          tickPoint(5000, 0),
          tickPoint(0, 0),
          4000n,
          4000n,
          BigInt(clearance)
        );
        const actual = classifyFindings(
          run({
            ...cleanProject,
            components: [
              component("U1", pad("A", 4000, 4000, "circle")),
              component("U2", pad("B", 4000, 4000, "circle"), 5000, 0),
            ],
            designRules: { ...zeroRules, padToPadClearance: world(clearance) },
          }),
          "PCB_PAD_TO_PAD_CLEARANCE"
        );
        expect(oracle).toBe(expected);
        add(id, oracle, actual);
      }

      for (const [id, clearance, expected] of [
        ["rotated-ellipse-pair-known-clear", 750, "CLEAR"],
        ["rotated-ellipse-pair-known-violation", 1250, "VIOLATION"],
      ] as const) {
        const center = rotatePointIndependent({ x: 0, y: 3 }, 15);
        const oracle = axisGapOracle(2000n, BigInt(clearance));
        const actual = classifyFindings(
          run({
            ...cleanProject,
            components: [
              component("U1", pad("A", 20000, 2000, "oval", 15)),
              {
                ...component("U2", pad("B", 20000, 2000, "oval", 15)),
                x: center.x,
                y: center.y,
              },
            ],
            designRules: { ...zeroRules, padToPadClearance: world(clearance) },
          }),
          "PCB_PAD_TO_PAD_CLEARANCE"
        );
        expect(oracle).toBe(expected);
        add(id, oracle, actual);
      }

      const board = { x: 0, y: 0, width: 100, height: 80, edgeClearance: 0 };
      for (const [id, x, expected] of [
        ["board-edge-exact-tangency", 1, "CLEAR"],
        ["board-edge-outside-shortfall", 0.999, "VIOLATION"],
      ] as const) {
        const signedInset = 2 * x - 2;
        const oracle: Class = signedInset >= 0 ? "CLEAR" : "VIOLATION";
        const actual = classifyFindings(
          run({
            ...cleanProject,
            board,
            tracks: [
              {
                id: "T",
                from: { x, y: 20 },
                to: { x: 20, y: 20 },
                width: 2,
                layer: "F.Cu",
              },
            ],
            designRules: { ...zeroRules, copperToEdgeClearance: 0 },
          }),
          "PCB_EDGE_CLEARANCE"
        );
        expect(oracle).toBe(expected);
        add(id, oracle, actual);
      }

      const totals = fixtures.reduce(
        (sum, fixture) => {
          const item = compareExpected(
            fixture.actual,
            fixture.expected,
            fixture.id
          );
          return {
            tp: sum.tp + item.tp,
            tn: sum.tn + item.tn,
            fp: sum.fp + item.fp,
            fn: sum.fn + item.fn,
            unresolved: sum.unresolved + item.unresolved,
          };
        },
        { tp: 0, tn: 0, fp: 0, fn: 0, unresolved: 0 }
      );
      expect(fixtures).toHaveLength(16);
      expect(totals).toEqual({ tp: 7, tn: 9, fp: 0, fn: 0, unresolved: 0 });
    });
  });
});
