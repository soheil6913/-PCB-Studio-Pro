import { describe, expect, it } from "vitest";
import {
  GeometryCalculationError,
  gjkWithinDistance,
  padToPadDistance,
  padToPadDistanceDetailed,
  validatePcb,
  viaToPadDistance,
  type Pad,
} from "./engineering";

function pad(id = "p", extra: Record<string, unknown> = {}): Pad {
  return {
    id,
    number: "1",
    position: { x: 0, y: 0 },
    width: 4,
    height: 4,
    shape: "circle",
    layer: "F.Cu",
    ...extra,
  } as Pad;
}

function oval(id: string, x: number, y: number): Pad {
  return { ...pad(id, { position: { x, y }, width: 10, height: 4, shape: "oval" }) };
}

describe("Phase 6.1 P2.4-B geometry API contract", () => {
  it.each([
    ["malformed first point", pad("a", { position: { x: Number.NaN, y: 0 } }), pad("b"), "invalid first pad geometry"],
    ["malformed second point", pad("a"), pad("b", { position: { x: Number.POSITIVE_INFINITY, y: 0 } }), "invalid second pad geometry"],
    ["unknown shape", pad("a", { shape: "triangle" }), pad("b"), "invalid first pad geometry"],
    ["invalid dimensions", pad("a", { width: 0 }), pad("b"), "invalid first pad geometry"],
    ["unequal Circle dimensions", pad("a", { height: 5 }), pad("b"), "invalid first pad geometry"],
  ])("returns a stable INDETERMINATE result for %s", (_label, first, second, reason) => {
    expect(() => padToPadDistanceDetailed(first as never, second as never)).not.toThrow();
    expect(padToPadDistanceDetailed(first as never, second as never)).toEqual({
      state: "INDETERMINATE",
      iterations: 0,
      reason,
    });
  });

  it("rejects malformed runtime options without leaking TypeError", () => {
    const first = oval("a", 0, 0);
    const second = oval("b", 2, 1);
    for (const options of [null, [], { gjkMaxIterations: "64" }, { gjkMaxIterations: Number.MAX_SAFE_INTEGER + 1 }, { timeout: 1 }]) {
      expect(() => padToPadDistanceDetailed(first, second, options as never)).not.toThrow();
      expect(padToPadDistanceDetailed(first, second, options as never)).toEqual({
        state: "INDETERMINATE",
        iterations: 0,
        reason: "invalid geometry options",
      });
    }
    expect(padToPadDistanceDetailed(first, second, { gjkMaxIterations: 0 })).toMatchObject({
      state: "INDETERMINATE",
      reason: "initial overlap query: invalid iteration budget",
    });
    expect(padToPadDistanceDetailed(first, second, { gjkMaxIterations: 1.5 })).toMatchObject({
      state: "INDETERMINATE",
      reason: "initial overlap query: invalid iteration budget",
    });
  });

  it("keeps direct GJK malformed-input behavior classified and non-throwing", () => {
    expect(gjkWithinDistance({} as never, pad("b"), 0)).toEqual({
      state: "INDETERMINATE",
      iterations: 0,
      reason: "invalid first pad geometry",
    });
    expect(gjkWithinDistance(pad("a"), pad("b"), Number.NaN)).toEqual({
      state: "INDETERMINATE",
      iterations: 0,
      reason: "invalid clearance",
    });
  });

  it("uses GeometryCalculationError for malformed numeric-wrapper inputs", () => {
    expect(() => padToPadDistance({} as never, pad("b"))).toThrow(GeometryCalculationError);
    expect(() => viaToPadDistance(pad("a"), { id: "v", x: 0, y: 0, drill: 0 } as never)).toThrow(GeometryCalculationError);
    expect(() => viaToPadDistance(pad("a"), { id: "v", x: Number.NaN, y: 0, drill: 1, diameter: 2 } as never)).toThrowError("invalid via geometry");
  });

  it("preserves valid Circle/Oval numeric behavior and valid detailed results", () => {
    const circle = pad("circle");
    const ovalPad = pad("oval", { shape: "oval", width: 4, height: 2, position: { x: 6, y: 0 } });
    expect(viaToPadDistance(circle, { id: "v", x: 3, y: 0, drill: 1, diameter: 1 })).toBeCloseTo(0.5, 10);
    expect(padToPadDistance(circle, ovalPad)).toBeCloseTo(2, 8);
    const detailed = padToPadDistanceDetailed(circle, ovalPad);
    expect(detailed.state).toBe("CONVERGED");
    if (detailed.state === "CONVERGED") expect(detailed.distance).toBeCloseTo(2, 8);
  });

  it("preserves fail-closed DRC behavior when GJK is indeterminate", () => {
    const findings = validatePcb({
      components: [{
        id: "u1",
        ref: "U1",
        x: 100,
        y: 100,
        footprintGeometry: { identifier: "FP", pads: [oval("a", 0, 0), oval("b", 2, 1)] },
      }],
      tracks: [],
      vias: [],
      board: { x: 0, y: 0, width: 300, height: 300, edgeClearance: 0 },
      designRules: { padToPadClearance: 1 },
    }, { gjkMaxIterations: 1 });
    expect(findings.some(finding => finding.ruleId === "PCB_GEOMETRY_INDETERMINATE")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "PCB_PAD_TO_PAD_CLEARANCE")).toBe(false);
  });
});
