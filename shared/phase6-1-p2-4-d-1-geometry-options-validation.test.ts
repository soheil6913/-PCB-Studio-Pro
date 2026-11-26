import { describe, expect, it } from "vitest";
import {
  gjkWithinDistance,
  padToPadDistanceDetailed,
  validatePcb,
  type Pad,
} from "./engineering";

function circle(id: string, x = 0, y = 0): Pad {
  return {
    id,
    number: id,
    position: { x, y },
    width: 4,
    height: 4,
    shape: "circle",
    layer: "F.Cu",
  };
}

function baseProject() {
  return { components: [], tracks: [], vias: [] };
}

describe("Phase 6.1 P2.4-D-1 geometry-options validation remediation", () => {
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["zero", 0],
    ["negative integer", -1],
    ["fractional", 1.5],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
    ["non-numeric", "64"],
  ])(
    "rejects %s consistently at both validation boundaries",
    (_label, value) => {
      const detailed = padToPadDistanceDetailed(circle("a"), circle("b", 20), {
        gjkMaxIterations: value,
      } as never);
      expect(detailed).toEqual({
        state: "INDETERMINATE",
        iterations: 0,
        reason: "invalid geometry options",
      });

      const findings = validatePcb(baseProject(), {
        gjkMaxIterations: value,
      } as never);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        ruleId: "PCB_INVALID_OPTIONS",
        severity: "Error",
        correction: "must be a positive safe integer",
      });
    }
  );

  it("rejects an explicitly undefined option while accepting omitted options and an empty object", () => {
    const first = circle("a");
    const second = circle("b", 20);
    expect(padToPadDistanceDetailed(first, second)).toMatchObject({
      state: "CONVERGED",
    });
    expect(
      padToPadDistanceDetailed(first, second, undefined as never)
    ).toMatchObject({ state: "CONVERGED" });
    expect(padToPadDistanceDetailed(first, second, {})).toMatchObject({
      state: "CONVERGED",
    });
    expect(
      padToPadDistanceDetailed(first, second, {
        gjkMaxIterations: undefined,
      } as never)
    ).toEqual({
      state: "INDETERMINATE",
      iterations: 0,
      reason: "invalid geometry options",
    });

    expect(validatePcb(baseProject())).toEqual([]);
    expect(validatePcb(baseProject(), undefined as never)).toEqual([]);
    expect(validatePcb(baseProject(), {})).toEqual([]);
    expect(
      validatePcb(baseProject(), { gjkMaxIterations: undefined } as never)[0]
    ).toMatchObject({
      ruleId: "PCB_INVALID_OPTIONS",
      correction: "must be a positive safe integer",
    });
  });

  it.each([1, 64, 257, Number.MAX_SAFE_INTEGER])(
    "accepts positive safe integer budget %s",
    gjkMaxIterations => {
      expect(
        padToPadDistanceDetailed(circle("a"), circle("b", 20), {
          gjkMaxIterations,
        })
      ).toMatchObject({ state: "CONVERGED" });
      expect(validatePcb(baseProject(), { gjkMaxIterations })).toEqual([]);
    }
  );

  it("validates options before analytic geometry dispatch", () => {
    const result = padToPadDistanceDetailed(circle("a"), circle("b", 20), {
      gjkMaxIterations: 0,
    });
    expect(result).toEqual({
      state: "INDETERMINATE",
      iterations: 0,
      reason: "invalid geometry options",
    });
  });

  it("preserves direct scalar GJK invalid-budget classification independently", () => {
    const first = circle("a");
    const second = circle("b", 20);
    expect(gjkWithinDistance(first, second, 0, 0)).toEqual({
      state: "INDETERMINATE",
      iterations: 0,
      reason: "invalid iteration budget",
    });
    expect(gjkWithinDistance(first, second, 0, 1.5)).toEqual({
      state: "INDETERMINATE",
      iterations: 0,
      reason: "invalid iteration budget",
    });
  });
});
