import { describe, expect, it } from "vitest";
import { padToPadDistance, transformLocalPoint, validatePcb, viaToPadDistance, type EngineeringVia, type Layer } from "./engineering";

const board = { x: 0, y: 0, width: 300, height: 300, edgeClearance: 0 };
const rules = {
  minimumTrackClearance: 0,
  copperToEdgeClearance: 0,
  trackToViaClearance: 0,
  trackToPadClearance: 0,
  padToPadClearance: 0,
};
const base = { components: [], tracks: [], vias: [], board, designRules: rules };

type Shape = "rect" | "oval" | "circle";
function pad(id: string, x: number, y: number, width: number, height: number, shape: Shape = "rect", rotation = 0) {
  return { id, number: id, position: { x, y }, width, height, shape, layer: "F.Cu" as const, rotation };
}

function independentCircleRectGap(circleCenterX: number, radius: number, rectRight: number) {
  return Math.max(0, circleCenterX - radius - rectRight);
}

describe("Phase 3 independent geometry verification", () => {
  it("matches analytic distances for mixed shapes and degeneracies", () => {
    expect(padToPadDistance(pad("a", 0, 0, 10, 4), pad("b", 16, 0, 10, 4))).toBeCloseTo(6, 10);
    expect(padToPadDistance(pad("a", 0, 0, 10, 4), pad("b", 10, 0, 10, 4))).toBe(0);
    expect(padToPadDistance(pad("a", 0, 0, 10, 4), pad("b", 8, 0, 10, 4))).toBe(0);
    expect(padToPadDistance(pad("a", 0, 0, 4, 4, "circle"), pad("b", 6, 0, 6, 4))).toBeCloseTo(independentCircleRectGap(6, 2, 3), 10);
    expect(padToPadDistance(pad("a", 0, 0, 4, 4, "circle"), pad("b", 8, 0, 10, 4, "oval"))).toBeCloseTo(1, 10);
    expect(padToPadDistance(pad("a", 0, 0, 10, 4, "oval"), pad("b", 0, 8, 10, 4, "oval"))).toBeCloseTo(4, 10);
    expect(padToPadDistance(pad("a", 0, 0, 10, 4, "oval"), pad("b", 0, 0, 10, 4, "oval"))).toBe(0);
    expect(padToPadDistance(pad("a", 0, 0, 4, 4, "circle"), pad("b", 0, 0, 10, 4, "rect"))).toBe(0);
    expect(padToPadDistance(pad("a", 0, 0, 2, 2), pad("b", 2 + 1e-8, 0, 2, 2))).toBeCloseTo(1e-8, 12);
    expect(padToPadDistance(pad("a", 0, 0, 2, 2), pad("b", 2 - 1e-8, 0, 2, 2))).toBe(0);
  });

  it.fails("matches the analytic gap for two equally rotated rectangles", () => {
    const diagonalGap = 16;
    const actual = padToPadDistance(pad("a", 0, 0, 10, 4, "rect", 45), pad("b", diagonalGap / Math.SQRT2, diagonalGap / Math.SQRT2, 10, 4, "rect", 45));
    expect(actual).toBeCloseTo(6, 10);
  });

  it("applies independent pad and component rotations exactly once", () => {
    const root = { x: 100, y: 100 };
    const localPadCenter = { x: 2, y: 0 };
    const componentRotation = 45;
    const padRotation = 45;
    const worldCenter = transformLocalPoint(root, localPadCenter, componentRotation);
    const expectedCenter = { x: 100 + Math.SQRT2, y: 100 + Math.SQRT2 };
    expect(worldCenter.x).toBeCloseTo(expectedCenter.x, 12);
    expect(worldCenter.y).toBeCloseTo(expectedCenter.y, 12);

    const padWithCombinedRotation = pad("combined", worldCenter.x, worldCenter.y, 10, 4, "rect", componentRotation + padRotation);
    const via = { id: "v", x: worldCenter.x, y: worldCenter.y + 7, drill: 1, diameter: 2, layers: ["F.Cu", "B.Cu"] as ["F.Cu", "B.Cu"] };
    expect(viaToPadDistance(padWithCombinedRotation, via)).toBeCloseTo(1, 10);

    const angles = [0, 45, 90, 180, 270, -90, 360];
    for (const angle of angles) {
      const point = transformLocalPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, angle);
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(10, 10);
    }
    expect(transformLocalPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 360)).toEqual(expect.objectContaining({ x: expect.closeTo(10, 10), y: expect.closeTo(0, 10) }));
  });

  it("checks rotated oval track thresholds, tangency, crossing, and zero-length tracks", () => {
    const oval = { id: "oval", number: "1", position: { x: 0, y: 0 }, width: 10, height: 4, shape: "oval" as const, layer: "F.Cu" as const, rotation: 90 };
    const component = { id: "u", ref: "U1", x: 150, y: 150, footprintGeometry: { identifier: "FP", pads: [oval] } };
    const check = (id: string, from: { x: number; y: number }, to: { x: number; y: number }, clearance: number) => validatePcb({ ...base, components: [component], tracks: [{ id, from, to, width: 0.2, layer: "F.Cu" }], designRules: { ...rules, trackToPadClearance: clearance } });
    expect(check("allowed", { x: 152.4, y: 144 }, { x: 152.4, y: 156 }, 0.29).some(f => f.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(false);
    expect(check("threshold", { x: 152.4, y: 144 }, { x: 152.4, y: 156 }, 0.31).some(f => f.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(true);
    expect(check("tangent", { x: 152, y: 144 }, { x: 152, y: 156 }, 0).some(f => f.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(true);
    expect(check("crossing", { x: 150, y: 144 }, { x: 150, y: 156 }, 0).some(f => f.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(true);
    expect(check("point", { x: 152.4, y: 150 }, { x: 152.4, y: 150 }, 0.29).some(f => f.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(false);
  });

  it("checks via shape, layer-specific clearance, and pad containment", () => {
    const circle = pad("circle", 0, 0, 10, 10, "circle");
    const oval = pad("oval", 0, 0, 12, 6, "oval");
    const rect = pad("rect", 0, 0, 10, 4, "rect", 45);
    const at = (x: number, y: number, diameter = 2, layers: [Layer, Layer] = ["F.Cu", "B.Cu"]): EngineeringVia => ({ id: `v-${x}-${y}`, x, y, drill: diameter / 2, diameter, layers });
    expect(viaToPadDistance(circle, at(0, 0))).toBe(0);
    expect(viaToPadDistance(oval, at(0, 0))).toBe(0);
    expect(viaToPadDistance(rect, at(0, 0))).toBe(0);
    expect(viaToPadDistance(circle, at(8, 0))).toBeCloseTo(2, 10);

    const padComponent = { id: "u", ref: "U1", x: 100, y: 100, footprintGeometry: { identifier: "FP", pads: [{ ...circle, position: { x: 0, y: 0 } }] } };
    const backOnly = validatePcb({ ...base, components: [padComponent], vias: [at(100, 100, 2, ["B.Cu", "B.Cu"])], designRules: { ...rules, viaToPadClearance: 1 } });
    expect(backOnly.some(f => f.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(false);
    const bothLayers = validatePcb({ ...base, components: [padComponent], vias: [at(100, 100)], designRules: { ...rules, viaToPadClearance: 1 } });
    expect(bothLayers.some(f => f.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(true);
  });

  it("checks track, via, edge, width, drill, annular-ring, and via-layer rules", () => {
    const findings = validatePcb({ ...base,
      tracks: [{ id: "edge", from: { x: 0, y: 100 }, to: { x: 20, y: 100 }, width: 2, layer: "F.Cu" }],
      vias: [{ id: "v", x: 0.5, y: 0.5, drill: 1, diameter: 1.5, layers: ["F.Cu", "B.Cu"] }],
      designRules: { ...rules, minimumTrackWidth: 3, minimumDrillDiameter: 2, minimumAnnularRing: 0.5, viaToPadClearance: 1 },
    });
    expect(findings.some(f => f.ruleId === "PCB_EDGE_CLEARANCE")).toBe(true);
    expect(findings.some(f => f.ruleId === "PCB_MINIMUM_TRACK_WIDTH")).toBe(true);
    expect(findings.some(f => f.ruleId === "PCB_VIA_EDGE_CLEARANCE")).toBe(true);
    expect(findings.some(f => f.ruleId === "PCB_MINIMUM_DRILL_DIAMETER")).toBe(true);
    expect(findings.some(f => f.ruleId === "PCB_MINIMUM_ANNULAR_RING")).toBe(true);
    expect(findings.some(f => f.ruleId === "PCB_VIA_LAYER_SPAN_UNAVAILABLE")).toBe(false);
  });

  it.fails("keeps sub-unit error below a strict large-coordinate analytic oracle", () => {
    const actual = padToPadDistance(pad("small", 1e9, 1e9, 2, 2), pad("large", 1e9 + 1_000_000, 1e9, 200_000, 200_000));
    const expected = 1_000_000 - 1 - 100_000;
    expect(actual).toBeCloseTo(expected, 6);
  });
});
