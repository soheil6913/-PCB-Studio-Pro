import { describe, expect, it } from "vitest";
import {
  padToPadDistanceDetailed,
  runDesignRules,
  segmentDistance,
  segmentsIntersect,
  validatePcb,
  type Pad,
} from "./engineering";

const farBoard = {
  x: -1e201,
  y: -1e201,
  width: 2e201,
  height: 2e201,
  edgeClearance: 0,
};
const noClearanceRules = {
  minimumTrackClearance: 1,
  copperToEdgeClearance: 0,
  trackToPadClearance: 0,
  padToPadClearance: 0,
  trackToViaClearance: 0,
  minimumViaClearance: 0,
  viaToPadClearance: 0,
};
const emptyProject = {
  components: [],
  tracks: [],
  vias: [],
  board: farBoard,
  designRules: noClearanceRules,
};
const pad = (
  id: string,
  width: number,
  height: number,
  shape: Pad["shape"] = "rect",
  rotation = 0
): Pad => ({
  id,
  number: id,
  position: { x: 0, y: 0 },
  width,
  height,
  shape,
  rotation,
  layer: "F.Cu",
});
const component = (id: string, x: number, y: number, item: Pad) => ({
  id,
  ref: id,
  x,
  y,
  footprintGeometry: { identifier: "FP", pads: [item] },
});

describe("Phase 5.2 adversarial DRC regressions", () => {
  describe("track-to-track orientation overflow", () => {
    const a0 = { x: -1e200, y: -1e200 };
    const a1 = { x: 1e200, y: 1e200 };
    const b0 = { x: -1e200, y: 1e200 };
    const b1 = { x: 1e200, y: -1e200 };

    it("recognizes exact crossing diagonals when raw determinant products would overflow", () => {
      // Independent oracle: the diagonal lines have opposite slopes and both contain (0,0).
      expect(segmentsIntersect(a0, a1, b0, b1)).toBe(true);
      expect(segmentDistance(a0, a1, b0, b1)).toBe(0);
    });

    it("propagates the crossing as a track-clearance error through validatePcb", () => {
      const findings = validatePcb({
        ...emptyProject,
        tracks: [
          { id: "A", from: a0, to: a1, width: 1, layer: "F.Cu" as const },
          { id: "B", from: b0, to: b1, width: 1, layer: "F.Cu" as const },
        ],
      });
      expect(
        findings.some(finding => finding.ruleId === "PCB_TRACK_CLEARANCE")
      ).toBe(true);
    });
  });

  describe("pad-to-pad finite-result and threshold safety", () => {
    it("never marks a non-finite rect-oval distance as converged", () => {
      const rect = pad("R", 1e200, 1, "rect");
      const oval = pad("O", 1e200, 1e200, "oval");
      const calculation = padToPadDistanceDetailed(
        { ...rect, position: { x: 1e200, y: 0 } },
        oval
      );
      expect(
        calculation.state === "INDETERMINATE" ||
          (calculation.state === "CONVERGED" &&
            Number.isFinite(calculation.distance))
      ).toBe(true);
    });

    it("reports the rect-oval uncertainty or clearance violation through DRC", () => {
      const findings = validatePcb({
        ...emptyProject,
        board: {
          x: -1e201,
          y: -1e201,
          width: 2e201,
          height: 2e201,
          edgeClearance: 0,
        },
        components: [
          component("R", 1e200, 0, pad("R1", 1e200, 1, "rect")),
          component("O", 0, 0, pad("O1", 1e200, 1e200, "oval")),
        ],
        designRules: { ...noClearanceRules, padToPadClearance: 1 },
      });
      expect(
        findings.some(
          finding =>
            finding.ruleId === "PCB_GEOMETRY_INDETERMINATE" ||
            finding.ruleId === "PCB_PAD_TO_PAD_CLEARANCE"
        )
      ).toBe(true);
    });

    it("does not let tolerance addition overflow and mask a representable shortfall", () => {
      const far = 1.7976931348623155e308;
      const required = Number.MAX_VALUE;
      const circleA = pad("A1", 1, 1, "circle");
      const circleB = pad("B1", 1, 1, "circle");
      const calculation = padToPadDistanceDetailed(
        { ...circleA, position: { x: 0, y: 0 } },
        { ...circleB, position: { x: far, y: 0 } }
      );
      expect(calculation.state).toBe("CONVERGED");
      if (calculation.state === "CONVERGED") {
        // Independent circle oracle: center separation minus the two radii.
        const expected = far - 0.5 - 0.5;
        expect(expected).toBeLessThan(required);
        expect(calculation.distance).toBe(expected);
      }
      const findings = validatePcb({
        ...emptyProject,
        board: {
          x: 0,
          y: -1,
          width: Number.MAX_VALUE,
          height: 2,
          edgeClearance: 0,
        },
        components: [
          component("A", 0, 0, circleA),
          component("B", far, 0, circleB),
        ],
        designRules: { ...noClearanceRules, padToPadClearance: required },
      });
      expect(
        findings.some(
          finding =>
            finding.ruleId === "PCB_PAD_TO_PAD_CLEARANCE" ||
            finding.ruleId === "PCB_GEOMETRY_INDETERMINATE"
        )
      ).toBe(true);
    });
  });

  describe("board copper-edge coverage", () => {
    const board = { x: 0, y: 0, width: 100, height: 100, edgeClearance: 5 };

    it("flags a pad whose copper boundary crosses the required board inset", () => {
      const findings = validatePcb({
        ...emptyProject,
        board,
        components: [
          component("U1", 5.99999995, 30, pad("P1", 2, 2, "circle")),
        ],
        designRules: { ...noClearanceRules, copperToEdgeClearance: 5 },
      });
      expect(
        findings.some(finding => finding.ruleId === "PCB_PAD_EDGE_CLEARANCE")
      ).toBe(true);
      expect(
        findings.find(finding => finding.ruleId === "PCB_PAD_EDGE_CLEARANCE")
          ?.objectIds
      ).toEqual(["U1", "P1"]);
    });

    it("uses rotated oval and rectangle copper extents, not only pad centers", () => {
      const ovalFindings = validatePcb({
        ...emptyProject,
        board,
        components: [
          component("O", 5.99999995, 30, pad("O1", 8, 2, "oval", 90)),
        ],
        designRules: { ...noClearanceRules, copperToEdgeClearance: 5 },
      });
      expect(
        ovalFindings.some(
          finding => finding.ruleId === "PCB_PAD_EDGE_CLEARANCE"
        )
      ).toBe(true);

      const rectangleFindings = validatePcb({
        ...emptyProject,
        board,
        components: [component("R", 7, 50, pad("R1", 8, 2, "rect", 45))],
        designRules: { ...noClearanceRules, copperToEdgeClearance: 5 },
      });
      expect(
        rectangleFindings.some(
          finding => finding.ruleId === "PCB_PAD_EDGE_CLEARANCE"
        )
      ).toBe(true);
    });

    it("accepts exact track inset but rejects a representable sub-EPSILON shortfall", () => {
      const makeFindings = (x: number) =>
        validatePcb({
          ...emptyProject,
          board,
          tracks: [
            {
              id: "T",
              from: { x, y: 20 },
              to: { x: 20, y: 20 },
              width: 2,
              layer: "F.Cu" as const,
            },
          ],
          designRules: { ...noClearanceRules, copperToEdgeClearance: 5 },
        });
      expect(
        makeFindings(6).some(finding => finding.ruleId === "PCB_EDGE_CLEARANCE")
      ).toBe(false);
      expect(
        makeFindings(5.99999995).some(
          finding => finding.ruleId === "PCB_EDGE_CLEARANCE"
        )
      ).toBe(true);
    });

    it("rejects a via just outside its exact copper-edge inset", () => {
      const findings = validatePcb({
        ...emptyProject,
        board,
        vias: [{ id: "V1", x: 5.99999995, y: 30, drill: 0.5, diameter: 2 }],
        designRules: { ...noClearanceRules, copperToEdgeClearance: 5 },
      });
      expect(
        findings.some(finding => finding.ruleId === "PCB_VIA_EDGE_CLEARANCE")
      ).toBe(true);
    });
  });

  it("keeps runDesignRules fail-closed for invalid via layers", () => {
    const findings = runDesignRules({
      components: [],
      wires: [],
      tracks: [],
      vias: [
        {
          id: "V1",
          x: 10,
          y: 10,
          drill: 1,
          diameter: 2,
          layers: ["F.Cu", "F.Cu"],
        },
      ],
    } as never);
    expect(findings[0]).toMatchObject({
      ruleId: "PROJECT_INVALID",
      severity: "Error",
    });
  });
});
