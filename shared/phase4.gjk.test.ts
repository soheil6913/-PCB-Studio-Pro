import { describe, expect, it } from "vitest";
import { padToPadDistance, validatePcb, viaToPadDistance } from "./engineering";

const board = { x: 0, y: 0, width: 300, height: 300, edgeClearance: 0 };
const rules = { minimumTrackClearance: 0, copperToEdgeClearance: 0, trackToViaClearance: 0, trackToPadClearance: 0, padToPadClearance: 0 };
const base = { components: [], tracks: [], vias: [], board, designRules: rules };

type Shape = "rect" | "oval" | "circle";
function pad(id: string, x: number, y: number, width: number, height: number, shape: Shape = "rect", rotation = 0) {
  return { id, number: id, position: { x, y }, width, height, shape, layer: "F.Cu" as const, rotation };
}

describe("Phase 4 GJK numerical corrections", () => {
  it("returns the exact common-axis gap for independently rotated rectangles", () => {
    const separation = 16;
    const actual = padToPadDistance(pad("a", 0, 0, 10, 4, "rect", 45), pad("b", separation / Math.SQRT2, separation / Math.SQRT2, 10, 4, "rect", 45));
    expect(actual).toBeCloseTo(6, 10);
  });

  it("returns the exact gap at large coordinates with very different scales", () => {
    const actual = padToPadDistance(pad("small", 1_000_000_000, 1_000_000_000, 2, 2), pad("large", 1_001_000_000, 1_000_000_000, 200_000, 200_000));
    expect(actual).toBeCloseTo(899999, 6);
  });

  it("preserves mixed-shape distances and degeneracy boundaries", () => {
    expect(padToPadDistance(pad("rect", 0, 0, 6, 4), pad("circle", 6, 0, 4, 4, "circle"))).toBeCloseTo(1, 10);
    expect(padToPadDistance(pad("rect", 0, 0, 6, 4), pad("circle-touch", 5, 0, 4, 4, "circle"))).toBe(0);
    expect(padToPadDistance(pad("circle", 0, 0, 4, 4, "circle"), pad("oval", 8, 0, 10, 4, "oval"))).toBeCloseTo(1, 10);
    expect(padToPadDistance(pad("oval-a", 0, 0, 10, 4, "oval"), pad("oval-b", 0, 8, 10, 4, "oval"))).toBeCloseTo(4, 10);
    expect(padToPadDistance(pad("circle-a", 0, 0, 4, 4, "circle"), pad("circle-b", 7, 0, 4, 4, "circle"))).toBeCloseTo(3, 10);
    expect(padToPadDistance(pad("tiny-a", 0, 0, 2, 2), pad("tiny-b", 2 + 1e-8, 0, 2, 2))).toBeCloseTo(1e-8, 12);
    expect(padToPadDistance(pad("tiny-a", 0, 0, 2, 2), pad("tiny-b", 2 - 1e-8, 0, 2, 2))).toBe(0);
  });

  it("keeps rotated mixed-shape gaps exact on a shared local axis", () => {
    const angle = 45;
    const axis = (distance: number) => ({ x: distance / Math.SQRT2, y: distance / Math.SQRT2 });
    expect(padToPadDistance(pad("rect", 0, 0, 10, 4, "rect", angle), pad("oval", axis(16).x, axis(16).y, 10, 4, "oval", angle))).toBeCloseTo(6, 8);
    expect(padToPadDistance(pad("rect", 0, 0, 10, 4, "rect", angle), pad("circle", axis(8).x, axis(8).y, 4, 4, "circle"))).toBeCloseTo(1, 8);
    expect(padToPadDistance(pad("oval", 0, 0, 10, 4, "oval", angle), pad("circle", axis(8).x, axis(8).y, 4, 4, "circle"))).toBeCloseTo(1, 8);
    expect(padToPadDistance(pad("oval-a", 0, 0, 10, 4, "oval", angle), pad("oval-b", axis(16).x, axis(16).y, 10, 4, "oval", angle))).toBeCloseTo(6, 8);
  });

  it("preserves rotation and via-to-pad behavior after the correction", () => {
    const rotatedRect = pad("rot", 0, 0, 10, 4, "rect", 90);
    expect(viaToPadDistance(rotatedRect, { id: "v", x: 0, y: 7, drill: 1, diameter: 2, layers: ["F.Cu", "B.Cu"] })).toBeCloseTo(1, 10);
    const rotatedOval = pad("oval", 0, 0, 10, 4, "oval", 90);
    const component = { id: "u", ref: "U1", x: 150, y: 150, footprintGeometry: { identifier: "FP", pads: [rotatedOval] } };
    const allowed = validatePcb({ ...base, components: [component], tracks: [{ id: "t", from: { x: 152.4, y: 144 }, to: { x: 152.4, y: 156 }, width: 0.2, layer: "F.Cu" }], designRules: { ...rules, trackToPadClearance: 0.29 } });
    expect(allowed.some(f => f.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(false);
  });
});
