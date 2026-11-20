import { describe, expect, it } from "vitest";
import { validatePcb } from "./engineering";
import {
  classifyDistanceInterval,
  compareSquaredDistanceToLengthSquared,
  pointToConvexPolygonDistanceSquaredExact,
  pointToRotatedRectangleDistanceInterval,
  quantizePointIndependent,
  rotatePointIndependent,
  rotatedRectangleCornersFixed,
  segmentToConvexPolygonDistanceSquaredExact,
  segmentToRotatedRectangleDistanceInterval,
  type DistanceInterval,
} from "./phase5_3.independent-oracle";

const Q = 1_000_000_000;
const BOARD = {
  x: -10_000,
  y: -10_000,
  width: 20_000,
  height: 20_000,
  edgeClearance: 0,
};
type Outcome = "CLEAR" | "VIOLATION" | "AMBIGUOUS";
type Point = { x: number; y: number };
type FixtureResult = { id: string; oracle: Outcome; actual: Outcome };

const zeroRules = {
  copperToEdgeClearance: 0,
  trackToPadClearance: 0,
  viaToPadClearance: 0,
};

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function localToWorld(point: Point, center: Point, angle: number): Point {
  return add(center, rotatePointIndependent(point, angle));
}

function rectangleComponent(
  center: Point,
  width = 6,
  height = 4,
  padRotation = 0,
  componentRotation = 0
) {
  return {
    id: "U1",
    ref: "U1",
    x: center.x,
    y: center.y,
    rotation: componentRotation,
    footprintGeometry: {
      identifier: "ROTATED-RECT-ORACLE",
      pads: [
        {
          id: "R1",
          number: "1",
          position: { x: 0, y: 0 },
          width,
          height,
          shape: "rect" as const,
          layer: "F.Cu" as const,
          rotation: padRotation,
        },
      ],
    },
  };
}

function trackProject(
  center: Point,
  angle: number,
  from: Point,
  to: Point,
  width = 0.2,
  clearance = 0.3,
  board = BOARD
) {
  return {
    components: [rectangleComponent(center, 6, 4, angle)],
    tracks: [{ id: "T1", from, to, width, layer: "F.Cu" as const }],
    vias: [],
    board,
    designRules: { ...zeroRules, trackToPadClearance: clearance },
  };
}

function viaProject(
  center: Point,
  angle: number,
  viaCenter: Point,
  diameter = 0.4,
  clearance = 0.3,
  board = BOARD
) {
  return {
    components: [rectangleComponent(center, 6, 4, angle)],
    tracks: [],
    vias: [
      {
        id: "V1",
        x: viaCenter.x,
        y: viaCenter.y,
        drill: 0.2,
        diameter,
        layers: ["F.Cu", "B.Cu"] as ["F.Cu", "B.Cu"],
      },
    ],
    board,
    designRules: { ...zeroRules, viaToPadClearance: clearance },
  };
}

function classify(
  findings: Array<{ ruleId: string; severity: string }>,
  rule: string
): Outcome {
  if (findings.some(item => item.ruleId === rule && item.severity === "Error"))
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

function actualOutcome(project: unknown, rule: string): Outcome {
  return classify(validatePcb(project as never), rule);
}

function intervalOutcome(
  interval: DistanceInterval,
  required: number
): Outcome {
  return classifyDistanceInterval(interval, required);
}

function exactSquaredOutcome(
  squared: { numerator: bigint; denominator: bigint },
  requiredUnits: bigint
): Outcome {
  const comparison = compareSquaredDistanceToLengthSquared(
    squared,
    requiredUnits
  );
  // A fixed-grid tie is not promoted to CLEAR: the continuous transformed
  // geometry can lie on either side within the grid/rounding envelope.
  return comparison === 0
    ? "AMBIGUOUS"
    : comparison > 0
      ? "CLEAR"
      : "VIOLATION";
}

function exactTrackOracle(
  from: Point,
  to: Point,
  center: Point,
  width: number,
  height: number,
  angle: number,
  required: number
): Outcome {
  const corners = rotatedRectangleCornersFixed(center, width, height, angle, Q);
  const squared = segmentToConvexPolygonDistanceSquaredExact(
    quantizePointIndependent(from, Q),
    quantizePointIndependent(to, Q),
    corners
  );
  return exactSquaredOutcome(squared, BigInt(Math.round(required * Q)));
}

function exactViaOracle(
  point: Point,
  center: Point,
  width: number,
  height: number,
  angle: number,
  required: number
): Outcome {
  const corners = rotatedRectangleCornersFixed(center, width, height, angle, Q);
  const squared = pointToConvexPolygonDistanceSquaredExact(
    quantizePointIndependent(point, Q),
    corners
  );
  return exactSquaredOutcome(squared, BigInt(Math.round(required * Q)));
}

function trackOracle(
  from: Point,
  to: Point,
  center: Point,
  width: number,
  height: number,
  angle: number,
  trackWidth: number,
  clearance: number
): Outcome {
  return intervalOutcome(
    segmentToRotatedRectangleDistanceInterval(
      from,
      to,
      center,
      width,
      height,
      angle,
      Q
    ),
    trackWidth / 2 + clearance
  );
}

function viaOracle(
  point: Point,
  center: Point,
  width: number,
  height: number,
  angle: number,
  diameter: number,
  clearance: number
): Outcome {
  return intervalOutcome(
    pointToRotatedRectangleDistanceInterval(
      point,
      center,
      width,
      height,
      angle,
      Q
    ),
    diameter / 2 + clearance
  );
}

function rectangleInfo(project: ReturnType<typeof trackProject>) {
  const component = project.components[0]!;
  const pad = component.footprintGeometry.pads[0]!;
  const center = add(
    { x: component.x, y: component.y },
    rotatePointIndependent(pad.position, component.rotation)
  );
  return {
    center,
    width: pad.width,
    height: pad.height,
    angle: component.rotation + pad.rotation,
  };
}

function shiftTrackProject(
  project: ReturnType<typeof trackProject>,
  dx: number,
  dy: number
) {
  return {
    ...project,
    board: {
      ...project.board,
      x: project.board.x + dx,
      y: project.board.y + dy,
    },
    components: project.components.map(component => ({
      ...component,
      x: component.x + dx,
      y: component.y + dy,
    })),
    tracks: project.tracks.map(track => ({
      ...track,
      from: { x: track.from.x + dx, y: track.from.y + dy },
      to: { x: track.to.x + dx, y: track.to.y + dy },
    })),
  };
}

function rotateTrackProject(
  project: ReturnType<typeof trackProject>,
  degrees: number
) {
  return {
    ...project,
    components: project.components.map(component => {
      const location = rotatePointIndependent(
        { x: component.x, y: component.y },
        degrees
      );
      return {
        ...component,
        x: location.x,
        y: location.y,
        rotation: component.rotation + degrees,
      };
    }),
    tracks: project.tracks.map(track => ({
      ...track,
      from: rotatePointIndependent(track.from, degrees),
      to: rotatePointIndependent(track.to, degrees),
    })),
  };
}

function reflectTrackProject(project: ReturnType<typeof trackProject>) {
  return {
    ...project,
    components: project.components.map(component => ({
      ...component,
      x: -component.x,
      rotation: -component.rotation,
      footprintGeometry: {
        ...component.footprintGeometry,
        pads: component.footprintGeometry.pads.map(pad => ({
          ...pad,
          position: { x: -pad.position.x, y: pad.position.y },
          rotation: -pad.rotation,
        })),
      },
    })),
    tracks: project.tracks.map(track => ({
      ...track,
      from: { x: -track.from.x, y: track.from.y },
      to: { x: -track.to.x, y: track.to.y },
    })),
  };
}

function scaleTrackProject(
  project: ReturnType<typeof trackProject>,
  factor: number
) {
  return {
    ...project,
    board: {
      ...project.board,
      x: project.board.x * factor,
      y: project.board.y * factor,
      width: project.board.width * factor,
      height: project.board.height * factor,
      edgeClearance: project.board.edgeClearance * factor,
    },
    components: project.components.map(component => ({
      ...component,
      x: component.x * factor,
      y: component.y * factor,
      footprintGeometry: {
        ...component.footprintGeometry,
        pads: component.footprintGeometry.pads.map(pad => ({
          ...pad,
          position: { x: pad.position.x * factor, y: pad.position.y * factor },
          width: pad.width * factor,
          height: pad.height * factor,
        })),
      },
    })),
    tracks: project.tracks.map(track => ({
      ...track,
      from: { x: track.from.x * factor, y: track.from.y * factor },
      to: { x: track.to.x * factor, y: track.to.y * factor },
      width: track.width * factor,
    })),
    designRules: {
      ...project.designRules,
      trackToPadClearance: project.designRules.trackToPadClearance * factor,
    },
  };
}

function reverseTrackProject(project: ReturnType<typeof trackProject>) {
  return {
    ...project,
    tracks: project.tracks.map(track => ({
      ...track,
      from: track.to,
      to: track.from,
    })),
  };
}

describe("Phase 5.3.8 independent rotated-rectangle oracle closure", () => {
  it("matches 28 track/via and metamorphic DRC fixtures without hiding unresolved boundaries", () => {
    const fixtures: FixtureResult[] = [];
    const counts = { tp: 0, tn: 0, fp: 0, fn: 0 };
    const unresolved: FixtureResult[] = [];
    const record = (id: string, oracle: Outcome, actual: Outcome) => {
      const result = { id, oracle, actual };
      fixtures.push(result);
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

    const width = 6;
    const height = 4;
    const trackWidth = 0.2;
    const clearance = 0.3;
    const required = trackWidth / 2 + clearance;
    const trackFixtures: Array<{
      id: string;
      angle: number;
      from: Point;
      to: Point;
      exact?: boolean;
    }> = [
      {
        id: "track-horizontal-through-rotated-rect",
        angle: 31,
        from: { x: -8, y: 0 },
        to: { x: 8, y: 0 },
      },
      {
        id: "track-vertical-through-rotated-rect",
        angle: 31,
        from: { x: 0, y: -8 },
        to: { x: 0, y: 8 },
      },
      {
        id: "track-diagonal-through-rotated-rect",
        angle: 31,
        from: { x: -8, y: -8 },
        to: { x: 8, y: 8 },
      },
      {
        id: "track-endpoint-contact-rotated-edge",
        angle: 31,
        from: localToWorld({ x: 3, y: 0 }, { x: 0, y: 0 }, 31),
        to: localToWorld({ x: 8, y: 0 }, { x: 0, y: 0 }, 31),
      },
      {
        id: "track-corner-contact-rotated-vertex",
        angle: 31,
        from: localToWorld({ x: 3, y: 2 }, { x: 0, y: 0 }, 31),
        to: localToWorld({ x: 6, y: 5 }, { x: 0, y: 0 }, 31),
      },
      {
        id: "track-exact-clearance-equality-90deg",
        angle: 90,
        from: localToWorld({ x: -8, y: 2 + required }, { x: 0, y: 0 }, 90),
        to: localToWorld({ x: 8, y: 2 + required }, { x: 0, y: 0 }, 90),
        exact: true,
      },
      {
        id: "track-0.001-unit-below-threshold",
        angle: 90,
        from: localToWorld(
          { x: -8, y: 2 + required - 0.001 },
          { x: 0, y: 0 },
          90
        ),
        to: localToWorld({ x: 8, y: 2 + required - 0.001 }, { x: 0, y: 0 }, 90),
      },
      {
        id: "track-0.001-unit-above-threshold",
        angle: 90,
        from: localToWorld(
          { x: -8, y: 2 + required + 0.001 },
          { x: 0, y: 0 },
          90
        ),
        to: localToWorld({ x: 8, y: 2 + required + 0.001 }, { x: 0, y: 0 }, 90),
      },
      {
        id: "track-rotated-tangency-uncertainty-31deg",
        angle: 31,
        from: localToWorld({ x: -8, y: 2 + required }, { x: 0, y: 0 }, 31),
        to: localToWorld({ x: 8, y: 2 + required }, { x: 0, y: 0 }, 31),
      },
    ];

    let metamorphicBase: ReturnType<typeof trackProject> | undefined;
    for (const fixture of trackFixtures) {
      const project = trackProject(
        { x: 0, y: 0 },
        fixture.angle,
        fixture.from,
        fixture.to,
        trackWidth,
        clearance
      );
      const oracle = fixture.exact
        ? exactTrackOracle(
            fixture.from,
            fixture.to,
            { x: 0, y: 0 },
            width,
            height,
            fixture.angle,
            required
          )
        : trackOracle(
            fixture.from,
            fixture.to,
            { x: 0, y: 0 },
            width,
            height,
            fixture.angle,
            trackWidth,
            clearance
          );
      const actual = actualOutcome(project, "PCB_TRACK_TO_PAD_CLEARANCE");
      record(fixture.id, oracle, actual);
      if (fixture.id === "track-0.001-unit-above-threshold")
        metamorphicBase = project;
    }

    const viaFixtures: Array<{
      id: string;
      angle: number;
      local: Point;
      diameter?: number;
      exact?: boolean;
      expected?: Outcome;
    }> = [
      {
        id: "via-at-rotated-rectangle-center",
        angle: 37,
        local: { x: 0, y: 0 },
        expected: "VIOLATION",
      },
      {
        id: "via-near-rotated-top-edge",
        angle: 37,
        local: { x: 0, y: 2.45 },
        expected: "VIOLATION",
      },
      {
        id: "via-near-rotated-bottom-edge",
        angle: 37,
        local: { x: 0, y: -2.45 },
        expected: "VIOLATION",
      },
      {
        id: "via-near-rotated-right-edge",
        angle: 37,
        local: { x: 3.45, y: 0 },
        expected: "VIOLATION",
      },
      {
        id: "via-near-rotated-left-edge",
        angle: 37,
        local: { x: -3.45, y: 0 },
        expected: "VIOLATION",
      },
      {
        id: "via-near-top-right-corner",
        angle: 37,
        local: { x: 3.2, y: 2.2 },
        expected: "VIOLATION",
      },
      {
        id: "via-near-top-left-corner",
        angle: 37,
        local: { x: -3.2, y: 2.2 },
        expected: "VIOLATION",
      },
      {
        id: "via-near-bottom-right-corner",
        angle: 37,
        local: { x: 3.2, y: -2.2 },
        expected: "VIOLATION",
      },
      {
        id: "via-near-bottom-left-corner",
        angle: 37,
        local: { x: -3.2, y: -2.2 },
        expected: "VIOLATION",
      },
      {
        id: "via-0.001-unit-below-threshold",
        angle: 90,
        local: { x: 0, y: 2.499 },
        expected: "VIOLATION",
      },
      {
        id: "via-exact-clearance-equality-90deg",
        angle: 90,
        local: { x: 0, y: 2.5 },
        exact: true,
        expected: "CLEAR",
      },
      {
        id: "via-0.001-unit-above-threshold",
        angle: 90,
        local: { x: 0, y: 2.501 },
        expected: "CLEAR",
      },
      {
        id: "via-small-copper-diameter-clear",
        angle: 37,
        local: { x: 0, y: 2.55 },
        diameter: 0.4,
        expected: "CLEAR",
      },
      {
        id: "via-large-copper-diameter-violation",
        angle: 37,
        local: { x: 0, y: 2.55 },
        diameter: 0.8,
        expected: "VIOLATION",
      },
    ];

    for (const fixture of viaFixtures) {
      const center = { x: 20, y: 30 };
      const diameter = fixture.diameter ?? 0.4;
      const viaCenter = localToWorld(fixture.local, center, fixture.angle);
      const project = viaProject(
        center,
        fixture.angle,
        viaCenter,
        diameter,
        0.3
      );
      const oracle = fixture.exact
        ? exactViaOracle(
            viaCenter,
            center,
            width,
            height,
            fixture.angle,
            diameter / 2 + 0.3
          )
        : viaOracle(
            viaCenter,
            center,
            width,
            height,
            fixture.angle,
            diameter,
            0.3
          );
      if (fixture.expected && oracle !== "AMBIGUOUS")
        expect(oracle, fixture.id).toBe(fixture.expected);
      const actual = actualOutcome(project, "PCB_VIA_TO_PAD_CLEARANCE");
      record(fixture.id, oracle, actual);
    }

    if (!metamorphicBase)
      throw new Error("metamorphic seed fixture was not constructed");
    const transforms: Array<[string, ReturnType<typeof trackProject>]> = [
      ["translation", shiftTrackProject(metamorphicBase, 23, -17)],
      ["rotation", rotateTrackProject(metamorphicBase, 37)],
      ["reflection", reflectTrackProject(metamorphicBase)],
      ["uniform-scale", scaleTrackProject(metamorphicBase, 3)],
      ["endpoint-reversal", reverseTrackProject(metamorphicBase)],
    ];
    for (const [name, project] of transforms) {
      const info = rectangleInfo(project);
      const track = project.tracks[0]!;
      const clearanceValue = project.designRules.trackToPadClearance;
      const oracle = trackOracle(
        track.from,
        track.to,
        info.center,
        info.width,
        info.height,
        info.angle,
        track.width,
        clearanceValue
      );
      const actual = actualOutcome(project, "PCB_TRACK_TO_PAD_CLEARANCE");
      record(`metamorphic-${name}`, oracle, actual);
      expect(oracle, `metamorphic oracle ${name}`).toBe("CLEAR");
    }

    expect(fixtures).toHaveLength(28);
    expect(counts.fp).toBe(0);
    expect(counts.fn).toBe(0);
    expect({ ...counts, unresolved: unresolved.length }).toEqual({
      tp: 17,
      tn: 8,
      fp: 0,
      fn: 0,
      unresolved: 3,
    });
    expect(unresolved).toEqual([
      {
        id: "track-exact-clearance-equality-90deg",
        oracle: "AMBIGUOUS",
        actual: "AMBIGUOUS",
      },
      {
        id: "track-rotated-tangency-uncertainty-31deg",
        oracle: "AMBIGUOUS",
        actual: "AMBIGUOUS",
      },
      {
        id: "via-exact-clearance-equality-90deg",
        oracle: "AMBIGUOUS",
        actual: "CLEAR",
      },
    ]);
  });
});
