import { describe, expect, it } from "vitest";
import { gjkWithinDistance, padToPadDistance, padToPadDistanceDetailed, validatePcb, type Pad } from "./engineering";

function oval(id: string, x: number, y: number, width = 10, height = 4, rotation = 0): Pad {
  return { id, number: id, position: { x, y }, width, height, shape: "oval", layer: "F.Cu", rotation };
}

const board = { x: 0, y: 0, width: 300, height: 300, edgeClearance: 0 };
const component = (id: string, first: Pad, second: Pad) => ({ id, ref: id, x: 100, y: 100, footprintGeometry: { identifier: `FP-${id}`, pads: [first, second] } });

describe("Phase 4.1 GJK convergence safety", () => {
  it("returns explicit converged results for separation, tangency, overlap, and tiny boundaries", () => {
    const separated = padToPadDistanceDetailed(oval("a", 0, 0), oval("b", 0, 8));
    expect(separated).toMatchObject({ state: "CONVERGED", distance: 4 });
    expect(padToPadDistance(oval("a", 0, 0), oval("b", 0, 8))).toBeCloseTo(4, 10);
    expect(padToPadDistance(oval("a", 0, 0), oval("b", 0, 4))).toBe(0);
    expect(padToPadDistance(oval("a", 0, 0), oval("b", 0, 2))).toBe(0);
    expect(padToPadDistance(oval("a", 0, 0), oval("b", 0, 4 + 1e-8))).toBeCloseTo(1e-8, 10);
    expect(padToPadDistance(oval("a", 0, 0), oval("b", 0, 4 - 1e-8))).toBe(0);
  });

  it("preserves small relative distances at large coordinates and scale ratios", () => {
    const farY = 1_000_000_004 + 1e-6;
    const expectedRepresentableGap = farY - 1_000_000_000 - 4;
    const largeCoordinate = padToPadDistance(oval("a", 1_000_000_000, 1_000_000_000), oval("b", 1_000_000_000, farY));
    expect(largeCoordinate).toBeCloseTo(expectedRepresentableGap, 12);
    const scaleRatio = padToPadDistance(oval("small", 0, 0, 10, 4), oval("large", 1_000_000, 0, 200_000, 200_000));
    expect(scaleRatio).toBeCloseTo(899995, 5);
  });

  it("converges for independently rotated oval pairs and repeated support geometry", () => {
    const angle = 45;
    const center = { x: 16 / Math.SQRT2, y: 16 / Math.SQRT2 };
    expect(padToPadDistance(oval("a", 0, 0, 10, 4, angle), oval("b", center.x, center.y, 10, 4, angle))).toBeCloseTo(6, 8);
    expect(padToPadDistanceDetailed(oval("same-a", 20, 20, 10, 4, 180), oval("same-b", 20, 20, 10, 4, -90))).toMatchObject({ state: "CONVERGED", distance: 0 });
  });

  it("reaches the real GJK loop and reports positive-budget iteration exhaustion", () => {
    // These overlapping, offset ellipses require another simplex update after the
    // first support point. A valid budget of one therefore exhausts inside GJK.
    const a = oval("a", 0, 0, 10, 4);
    const b = oval("b", 2, 1, 10, 4);
    // Independent overlap oracle: the Minkowski difference is an ellipse with
    // semi-axes 10 and 4; (2/10)^2 + (1/4)^2 < 1 places the origin inside it.
    expect((2 ** 2) / (10 ** 2) + (1 ** 2) / (4 ** 2)).toBeLessThan(1);
    expect(padToPadDistanceDetailed(a, b)).toMatchObject({ state: "CONVERGED", distance: 0 });

    const direct = gjkWithinDistance(a, b, 0, 1);
    expect(direct).toEqual({
      state: "INDETERMINATE",
      iterations: 1,
      reason: "iteration limit exhausted before convergence",
    });

    const detailed = padToPadDistanceDetailed(a, b, { gjkMaxIterations: 1 });
    expect(detailed.state).toBe("INDETERMINATE");
    if (detailed.state === "INDETERMINATE") {
      expect(detailed.iterations).toBe(1);
      expect(detailed.reason).toContain("iteration limit exhausted before convergence");
      expect("distance" in detailed).toBe(false);
    }
  });

  it("reports an invalid zero iteration budget separately from loop exhaustion", () => {
    const a = oval("a", 0, 0, 10, 4);
    const b = oval("b", 2, 1, 10, 4);
    expect(gjkWithinDistance(a, b, 0, 0)).toEqual({
      state: "INDETERMINATE",
      iterations: 0,
      reason: "invalid iteration budget",
    });
    const detailed = padToPadDistanceDetailed(a, b, { gjkMaxIterations: 0 });
    expect(detailed.state).toBe("INDETERMINATE");
    if (detailed.state === "INDETERMINATE") {
      expect(detailed.iterations).toBe(0);
      expect(detailed.reason).toBe("invalid geometry options");
      expect("distance" in detailed).toBe(false);
    }
  });

  it("surfaces actual positive-budget GJK exhaustion as an explicit DRC error", () => {
    const first = oval("a", 0, 0, 10, 4);
    const second = oval("b", 2, 1, 10, 4);
    const findings = validatePcb(
      { components: [component("U1", first, second)], tracks: [], vias: [], board, designRules: { padToPadClearance: 1 } },
      { gjkMaxIterations: 1 },
    );
    const diagnostic = findings.find(finding => finding.ruleId === "PCB_GEOMETRY_INDETERMINATE");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.severity).toBe("Error");
    expect(diagnostic?.explanation).toContain("iteration limit exhausted before convergence");
    expect(diagnostic?.explanation).toContain("could not be verified");
    expect(findings.some(finding => finding.ruleId === "PCB_PAD_TO_PAD_CLEARANCE")).toBe(false);
  });
});
