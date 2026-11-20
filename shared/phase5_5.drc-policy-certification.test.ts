import { describe, expect, it } from "vitest";
import {
  validatePcb,
  validateProjectJsonDetailed,
  type EngineeringComponent,
  type EngineeringProject,
  type EngineeringTrack,
  type EngineeringVia,
  type Layer,
} from "./engineering";
import {
  compareSquaredDistanceToLengthSquared,
  segmentDistanceSquaredExact,
  tickPoint,
} from "./phase5_3.independent-oracle";

type Finding = { ruleId: string; severity: string };
type Outcome = "CLEAR" | "VIOLATION" | "AMBIGUOUS";
const FAR_BOARD = { x: -50, y: -50, width: 100, height: 100, edgeClearance: 0 };
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

function track(
  id: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
  layer: Layer = "F.Cu",
  net?: string
): EngineeringTrack {
  return { id, from, to, width, layer, ...(net === undefined ? {} : { net }) };
}

function via(
  id: string,
  x: number,
  y: number,
  diameter = 2,
  layers?: [Layer, Layer]
): EngineeringVia {
  return {
    id,
    x,
    y,
    drill: diameter / 2,
    diameter,
    ...(layers === undefined ? {} : { layers }),
  };
}

function padComponent(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  shape: "circle" | "rect" = "circle",
  rotation = 0
): EngineeringComponent {
  return {
    id,
    ref: id,
    x,
    y,
    rotation: 0,
    footprintGeometry: {
      identifier: `FP-${id}`,
      pads: [
        {
          id: `${id}-P1`,
          number: "1",
          position: { x: 0, y: 0 },
          width,
          height,
          shape,
          layer: "F.Cu",
          rotation,
        },
      ],
    },
  };
}

function project(options: {
  tracks?: EngineeringTrack[];
  vias?: EngineeringVia[];
  components?: EngineeringComponent[];
  board?: EngineeringProject["board"];
  rules?: Partial<typeof zeroRules>;
} = {}): EngineeringProject {
  return {
    components: options.components ?? [],
    wires: [],
    tracks: options.tracks ?? [],
    vias: options.vias ?? [],
    board: options.board ?? FAR_BOARD,
    designRules: { ...zeroRules, ...(options.rules ?? {}) },
  };
}

function outcome(input: EngineeringProject, ruleId: string): Outcome {
  const findings = validatePcb(input) as Finding[];
  if (findings.some(finding => finding.ruleId === "PCB_INVALID_INPUT"))
    throw new Error("test fixture was unexpectedly rejected as invalid");
  if (findings.some(finding => finding.ruleId === ruleId && finding.severity === "Error"))
    return "VIOLATION";
  if (findings.some(finding => finding.ruleId === "PCB_GEOMETRY_INDETERMINATE" && finding.severity === "Error"))
    return "AMBIGUOUS";
  return "CLEAR";
}

function edgeOutcome(input: EngineeringProject, ruleId: string): boolean {
  return (validatePcb(input) as Finding[]).some(
    finding => finding.ruleId === ruleId && finding.severity === "Error"
  );
}

function edgeTrack(side: string, position: number, board: { x: number; y: number; width: number; height: number; edgeClearance: number }) {
  const vertical = side === "left" || side === "right";
  const from = vertical
    ? { x: position, y: board.y + 10 }
    : { x: board.x + 10, y: position };
  const to = vertical
    ? { x: position, y: board.y + board.height - 10 }
    : { x: board.x + board.width - 10, y: position };
  return track(`EDGE-TRACK-${side}`, from, to, 2);
}

function rotatedRectangleHalfExtents(width: number, height: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const corners = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ].map(point => ({
    x: point.x * c - point.y * s,
    y: point.x * s + point.y * c,
  }));
  return {
    minX: Math.min(...corners.map(point => point.x)),
    maxX: Math.max(...corners.map(point => point.x)),
    minY: Math.min(...corners.map(point => point.y)),
    maxY: Math.max(...corners.map(point => point.y)),
  };
}

describe("Phase 5.5 DRC policy observations and boundary certification", () => {
  it("records zero-clearance physical relations by primitive pair without declaring product policy", () => {
    // The relation labels below follow independently specified closed-set geometry.
    // Expectations deliberately characterize current behavior, not endorsement.
    const cases: Array<{ pair: string; relation: string; result: Outcome; build: () => [EngineeringProject, string] }> = [];
    const add = (pair: string, relation: string, result: Outcome, build: () => [EngineeringProject, string]) =>
      cases.push({ pair, relation, result, build });

    const trackPairs: Array<{ relation: string; dy: number; widthA?: number; widthB?: number; startB?: number; endB?: number; expected: Outcome }> = [
      { relation: "positive physical separation", dy: 4, expected: "CLEAR" },
      { relation: "exact tangency", dy: 2, expected: "CLEAR" },
      { relation: "partial overlap", dy: 1, expected: "VIOLATION" },
      { relation: "complete containment", dy: 0, widthA: 4, widthB: 1, startB: -1, endB: 1, expected: "VIOLATION" },
      { relation: "identical geometry", dy: 0, expected: "VIOLATION" },
    ];
    for (const spec of trackPairs) add("track-track", spec.relation, spec.expected, () => [
      project({ tracks: [
        track("TT-A", { x: -5, y: 0 }, { x: 5, y: 0 }, spec.widthA ?? 2),
        track("TT-B", { x: spec.startB ?? -5, y: spec.dy }, { x: spec.endB ?? 5, y: spec.dy }, spec.widthB ?? 2),
      ] }), "PCB_TRACK_CLEARANCE",
    ]);

    const trackVia: Array<{ relation: string; y: number; trackWidth?: number; viaDiameter?: number; zeroLength?: boolean; expected: Outcome }> = [
      { relation: "positive physical separation", y: 3, expected: "CLEAR" },
      { relation: "exact tangency", y: 2, expected: "CLEAR" },
      { relation: "partial overlap", y: 1, expected: "VIOLATION" },
      { relation: "complete containment", y: 0, trackWidth: 4, viaDiameter: 1, expected: "VIOLATION" },
      { relation: "identical geometry (zero-length track and round via)", y: 0, zeroLength: true, expected: "VIOLATION" },
    ];
    for (const spec of trackVia) add("track-via", spec.relation, spec.expected, () => [
      project({ tracks: [track("TV-T", { x: spec.zeroLength ? 0 : -5, y: 0 }, { x: spec.zeroLength ? 0 : 5, y: 0 }, spec.trackWidth ?? 2)], vias: [via("TV-V", 0, spec.y, spec.viaDiameter ?? 2, ["F.Cu", "B.Cu"])] }), "PCB_TRACK_TO_VIA_CLEARANCE",
    ]);

    const trackPad: Array<{ relation: string; y: number; trackWidth?: number; padDiameter?: number; zeroLength?: boolean; expected: Outcome }> = [
      { relation: "positive physical separation", y: 3, expected: "CLEAR" },
      { relation: "exact tangency", y: 2, expected: "CLEAR" },
      { relation: "partial overlap", y: 1, expected: "VIOLATION" },
      { relation: "complete containment", y: 0, trackWidth: 4, padDiameter: 1, expected: "VIOLATION" },
      { relation: "identical geometry (zero-length track and circle)", y: 0, zeroLength: true, expected: "VIOLATION" },
    ];
    for (const spec of trackPad) add("track-pad", spec.relation, spec.expected, () => [
      project({ tracks: [track("TP-T", { x: spec.zeroLength ? 0 : -5, y: spec.zeroLength ? spec.y : 0 }, { x: spec.zeroLength ? 0 : 5, y: spec.zeroLength ? spec.y : 0 }, spec.trackWidth ?? 2)], components: [padComponent("TP-P", 0, spec.zeroLength ? 0 : spec.y, spec.padDiameter ?? 2, spec.padDiameter ?? 2)] }), "PCB_TRACK_TO_PAD_CLEARANCE",
    ]);

    const viaVia: Array<{ relation: string; distance: number; diameterA?: number; diameterB?: number; expected: Outcome }> = [
      { relation: "positive physical separation", distance: 3, expected: "CLEAR" },
      { relation: "exact tangency", distance: 2, expected: "CLEAR" },
      { relation: "partial overlap", distance: 1, expected: "VIOLATION" },
      { relation: "complete containment", distance: 0, diameterA: 1, diameterB: 4, expected: "VIOLATION" },
      { relation: "identical geometry", distance: 0, expected: "VIOLATION" },
    ];
    for (const spec of viaVia) add("via-via", spec.relation, spec.expected, () => [
      project({ vias: [via("VV-A", 0, 0, spec.diameterA ?? 2, ["F.Cu", "B.Cu"]), via("VV-B", spec.distance, 0, spec.diameterB ?? 2, ["B.Cu", "F.Cu"])] }), "PCB_VIA_TO_VIA_CLEARANCE",
    ]);

    const viaPad: Array<{ relation: string; x: number; viaDiameter?: number; padDiameter?: number; padShape?: "circle" | "rect"; expected: Outcome }> = [
      { relation: "positive physical separation", x: 3, expected: "CLEAR" },
      { relation: "exact tangency", x: 2, expected: "CLEAR" },
      { relation: "partial overlap", x: 1, expected: "CLEAR" },
      { relation: "complete containment", x: 0, padDiameter: 4, padShape: "rect", viaDiameter: 1, expected: "CLEAR" },
      { relation: "identical geometry", x: 0, expected: "CLEAR" },
    ];
    for (const spec of viaPad) add("via-pad", spec.relation, spec.expected, () => [
      project({ vias: [via("VP-V", spec.x, 0, spec.viaDiameter ?? 2, ["F.Cu", "B.Cu"])], components: [padComponent("VP-P", 0, 0, spec.padDiameter ?? 2, spec.padDiameter ?? 2, spec.padShape ?? "circle")] }), "PCB_VIA_TO_PAD_CLEARANCE",
    ]);

    const padPad: Array<{ relation: string; x: number; diameterA?: number; diameterB?: number; expected: Outcome }> = [
      { relation: "positive physical separation", x: 3, expected: "CLEAR" },
      { relation: "exact tangency", x: 2, expected: "CLEAR" },
      { relation: "partial overlap", x: 1, expected: "CLEAR" },
      { relation: "complete containment", x: 0, diameterA: 1, diameterB: 4, expected: "CLEAR" },
      { relation: "identical geometry", x: 0, expected: "CLEAR" },
    ];
    for (const spec of padPad) add("pad-pad", spec.relation, spec.expected, () => [
      project({ components: [padComponent("PP-A", 0, 0, spec.diameterA ?? 2, spec.diameterA ?? 2), padComponent("PP-B", spec.x, 0, spec.diameterB ?? 2, spec.diameterB ?? 2)] }), "PCB_PAD_TO_PAD_CLEARANCE",
    ]);

    expect(cases).toHaveLength(30);
    for (const item of cases) {
      const [input, ruleId] = item.build();
      expect(outcome(input, ruleId), `${item.pair}: ${item.relation}`).toBe(item.result);
    }
  });

  it("certifies representable via-via spans and records schema limits without inventing a stackup", () => {
    const coincident = (layersA?: unknown, layersB?: unknown) => ({
      components: [], wires: [], tracks: [],
      vias: [
        { id: "SPAN-A", x: 0, y: 0, drill: 0.5, diameter: 1, ...(layersA === undefined ? {} : { layers: layersA }) },
        { id: "SPAN-B", x: 0, y: 0, drill: 0.5, diameter: 1, ...(layersB === undefined ? {} : { layers: layersB }) },
      ],
      board: FAR_BOARD,
      designRules: { ...zeroRules, minimumViaClearance: 0.1 },
    });
    const sameOrdered = coincident(["F.Cu", "B.Cu"], ["F.Cu", "B.Cu"]);
    const reversed = coincident(["F.Cu", "B.Cu"], ["B.Cu", "F.Cu"]);
    for (const value of [sameOrdered, reversed]) {
      expect(validateProjectJsonDetailed(value).ok).toBe(true);
      expect((validatePcb(value as never) as Finding[]).some(finding => finding.ruleId === "PCB_VIA_TO_VIA_CLEARANCE")).toBe(true);
    }

    const missingSpan = coincident(undefined, ["F.Cu", "B.Cu"]);
    const missingFindings = validatePcb(missingSpan as never) as Finding[];
    expect(missingFindings.some(finding => finding.ruleId === "PCB_VIA_LAYER_SPAN_UNAVAILABLE" && finding.severity === "Info")).toBe(true);
    // Existing engine behavior: via-via clearance does not use via.layers.
    expect(missingFindings.some(finding => finding.ruleId === "PCB_VIA_TO_VIA_CLEARANCE")).toBe(true);

    for (const malformed of [
      ["F.Cu"],
      ["F.Cu", "F.Cu"],
      ["In1.Cu", "B.Cu"],
      ["F.Cu", "In1.Cu"],
    ]) {
      const invalid = coincident(malformed, ["F.Cu", "B.Cu"]);
      expect(validateProjectJsonDetailed(invalid).ok).toBe(false);
      expect((validatePcb(invalid as never) as Finding[])[0]?.ruleId).toBe("PCB_INVALID_INPUT");
    }

    // In the project type, Layer is only F.Cu | B.Cu and a valid span must be
    // exactly those two distinct values. Thus partial/adjacent disjoint spans,
    // explicit through-hole vs blind/buried types, and no-shared-layer pairs
    // cannot be encoded as valid distinct scenarios in this version.
    expect(validateProjectJsonDetailed(coincident(["B.Cu", "F.Cu"], ["B.Cu", "F.Cu"])).ok).toBe(true);
  });

  it("certifies equality states independently for fixed-grid track pairs", () => {
    const distances = [1, 2, 3]; // threshold centerline distance is 2
    const expected: Outcome[] = ["VIOLATION", "CLEAR", "CLEAR"];
    for (let i = 0; i < distances.length; i += 1) {
      const gap = distances[i]!;
      const exact = segmentDistanceSquaredExact(
        tickPoint(-5000, 0), tickPoint(5000, 0),
        tickPoint(-5000, gap * 1000), tickPoint(5000, gap * 1000)
      );
      expect(compareSquaredDistanceToLengthSquared(exact, 2000n) >= 0 ? "CLEAR" : "VIOLATION").toBe(expected[i]);
      const input = project({
        tracks: [track("EQ-A", { x: -5, y: 0 }, { x: 5, y: 0 }, 1), track("EQ-B", { x: -5, y: gap }, { x: 5, y: gap }, 1)],
        rules: { minimumTrackClearance: 1 },
      });
      expect(outcome(input, "PCB_TRACK_CLEARANCE"), `gap ${gap}`).toBe(expected[i]);
    }
  });

  it("covers all four board edges for tracks, vias, circles, and rotated rectangles at equality and either side", () => {
    const board = { x: 0, y: 0, width: 100, height: 80, edgeClearance: 1 };
    const delta = 0.01;
    const edgeCases: Array<{ primitive: string; side: string; position: "outside" | "tangent" | "inside"; violated: boolean }> = [];
    const sides = ["left", "right", "top", "bottom"] as const;
    for (const primitive of ["track", "via", "circle", "rotated-rect"] as const) {
      for (const side of sides) {
        for (const position of ["outside", "tangent", "inside"] as const) {
          const violated = position === "outside";
          edgeCases.push({ primitive, side, position, violated });
          let components: EngineeringComponent[] = [];
          let vias: EngineeringVia[] = [];
          let tracks: EngineeringTrack[] = [];
          if (primitive === "track") {
            const boundary = side === "left" ? board.x + 2 : side === "right" ? board.x + board.width - 2 : side === "top" ? board.y + 2 : board.y + board.height - 2;
            const shift = position === "outside" ? -delta : position === "inside" ? delta : 0;
            const signed = side === "left" || side === "top" ? shift : -shift;
            tracks = [edgeTrack(side, boundary + signed, board)];
          } else if (primitive === "via" || primitive === "circle") {
            const boundary = side === "left" ? board.x + 2 : side === "right" ? board.x + board.width - 2 : side === "top" ? board.y + 2 : board.y + board.height - 2;
            const shift = position === "outside" ? -delta : position === "inside" ? delta : 0;
            const signed = side === "left" || side === "top" ? shift : -shift;
            const x = side === "left" || side === "right" ? boundary + signed : board.x + board.width / 2;
            const y = side === "top" || side === "bottom" ? boundary + signed : board.y + board.height / 2;
            if (primitive === "via") vias = [via(`EDGE-V-${side}-${position}`, x, y, 2, ["F.Cu", "B.Cu"])];
            else components = [padComponent(`EDGE-C-${side}-${position}`, x, y, 2, 2)];
          } else {
            const width = 8;
            const height = 2;
            const angle = 45;
            const bounds = rotatedRectangleHalfExtents(width, height, angle);
            const shift = position === "outside" ? -delta : position === "inside" ? delta : 0;
            const centerX = side === "left" ? board.x + board.edgeClearance - bounds.minX + shift : side === "right" ? board.x + board.width - board.edgeClearance - bounds.maxX - shift : board.x + board.width / 2;
            const centerY = side === "top" ? board.y + board.edgeClearance - bounds.minY + shift : side === "bottom" ? board.y + board.height - board.edgeClearance - bounds.maxY - shift : board.y + board.height / 2;
            components = [padComponent(`EDGE-R-${side}-${position}`, centerX, centerY, width, height, "rect", angle)];
          }
          const input = project({ tracks, vias, components, board, rules: { copperToEdgeClearance: board.edgeClearance } });
          const ruleId = primitive === "track" ? "PCB_EDGE_CLEARANCE" : primitive === "via" ? "PCB_VIA_EDGE_CLEARANCE" : "PCB_PAD_EDGE_CLEARANCE";
          expect(edgeOutcome(input, ruleId), `${primitive}/${side}/${position}`).toBe(violated);
        }
      }
    }
    expect(edgeCases).toHaveLength(48);

    // Physical containment is separately checked: with zero inset, this track's
    // copper crosses x=0 even though the spacing requirement is zero.
    const protruding = project({
      tracks: [track("EDGE-PHYSICAL-PROTRUSION", { x: 0.9, y: 10 }, { x: 0.9, y: 70 }, 2)],
      board: { ...board, edgeClearance: 0 },
      rules: { copperToEdgeClearance: 0 },
    });
    expect(edgeOutcome(protruding, "PCB_EDGE_CLEARANCE")).toBe(true);
  });

  it("preserves track-pair clearance classification under exact metamorphic transforms", () => {
    const base = {
      a: track("META-A", { x: -5, y: 0 }, { x: 5, y: 0 }, 1),
      b: track("META-B", { x: -5, y: 1 }, { x: 5, y: 1 }, 1),
    };
    const mapPoint = (point: { x: number; y: number }, name: string, reverse = false) => {
      let mapped = { ...point };
      if (name === "translation") mapped = { x: mapped.x + 20, y: mapped.y - 17 };
      if (name === "rotation") mapped = { x: -mapped.y, y: mapped.x };
      if (name === "reflection") mapped = { x: -mapped.x, y: mapped.y };
      if (name === "scale") mapped = { x: mapped.x * 2, y: mapped.y * 2 };
      return mapped;
    };
    for (const name of ["identity", "translation", "rotation", "reflection", "scale", "endpoint-reversal"]) {
      const scale = name === "scale" ? 2 : 1;
      const reverse = name === "endpoint-reversal";
      const aFrom = mapPoint(base.a.from, name);
      const aTo = mapPoint(base.a.to, name);
      const bFrom = mapPoint(base.b.from, name);
      const bTo = mapPoint(base.b.to, name);
      const input = project({
        tracks: [
          track(`META-${name}-A`, reverse ? aTo : aFrom, reverse ? aFrom : aTo, base.a.width * scale),
          track(`META-${name}-B`, reverse ? bTo : bFrom, reverse ? bFrom : bTo, base.b.width * scale),
        ],
        rules: { minimumTrackClearance: 1 * scale },
      });
      expect(outcome(input, "PCB_TRACK_CLEARANCE"), name).toBe("VIOLATION");
    }
  });
});
