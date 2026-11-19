import { describe, expect, it } from "vitest";
import {
  gjkWithinDistance,
  padToPadDistanceDetailed,
  runDesignRules,
  segmentDistance,
  validatePcb,
  validateProjectJsonDetailed,
  type Pad,
} from "./engineering";

const pad = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  shape: Pad["shape"] = "oval",
  rotation = 0
): Pad => ({
  id,
  number: id,
  position: { x, y },
  width,
  height,
  shape,
  layer: "F.Cu",
  rotation,
});

const circleBoard = {
  x: -100,
  y: -100,
  width: 200,
  height: 200,
  edgeClearance: 0,
};
const baselineProject = {
  components: [],
  tracks: [],
  vias: [],
  board: circleBoard,
  designRules: {
    minimumTrackClearance: 0,
    trackToPadClearance: 0,
    padToPadClearance: 0,
    trackToViaClearance: 0,
    minimumViaClearance: 0,
    viaToPadClearance: 0,
  },
};

function pcbWithTrack(
  first: { x: number; y: number },
  second: { x: number; y: number },
  width: number,
  componentPad: Pad,
  padOrigin = { x: 0, y: 0 },
  clearance = 0
) {
  return validatePcb({
    ...baselineProject,
    components: [
      {
        id: "U1",
        ref: "U1",
        x: padOrigin.x,
        y: padOrigin.y,
        footprintGeometry: { identifier: "FP", pads: [componentPad] },
      },
    ],
    tracks: [
      { id: "T1", from: first, to: second, width, layer: "F.Cu" as const },
    ],
    designRules: {
      ...baselineProject.designRules,
      trackToPadClearance: clearance,
    },
  });
}

describe("Phase 5.1 targeted geometry and validation corrections", () => {
  describe("F-01: scale-aware GJK classification", () => {
    it("reports analytically known positive gaps at multiple tiny and ordinary scales", () => {
      for (const scale of [1e-15, 1e-12, 1e-9, 1]) {
        const height = 2 * scale;
        const centerDistance = 2 * scale + 0.25 * scale;
        const result = padToPadDistanceDetailed(
          pad("a", 0, 0, 4 * scale, height),
          pad("b", 0, centerDistance, 4 * scale, height)
        );
        expect(result.state, `scale=${scale}`).toBe("CONVERGED");
        if (result.state === "CONVERGED") {
          // For equal, axis-aligned ellipses, vertical separation is center gap minus
          // the sum of their vertical semi-axes; this oracle is independent of GJK.
          expect(result.distance / scale).toBeCloseTo(0.25, 7);
        }
      }
    });

    it("distinguishes tiny overlap, exact tangency, and a tiny separated pair", () => {
      const scale = 1e-15;
      const a = pad("a", 0, 0, 4 * scale, 2 * scale);
      const overlap = pad("overlap", 0, 1.5 * scale, 4 * scale, 2 * scale);
      const tangent = pad("tangent", 0, 2 * scale, 4 * scale, 2 * scale);
      const separated = pad("separated", 0, 2.25 * scale, 4 * scale, 2 * scale);

      expect(padToPadDistanceDetailed(a, overlap)).toMatchObject({
        state: "CONVERGED",
        distance: 0,
      });
      expect(padToPadDistanceDetailed(a, tangent)).toMatchObject({
        state: "CONVERGED",
        distance: 0,
      });
      const result = padToPadDistanceDetailed(a, separated);
      expect(result.state).toBe("CONVERGED");
      if (result.state === "CONVERGED")
        expect(result.distance / scale).toBeCloseTo(0.25, 7);
    });

    it("preserves small local gaps after a large coordinate translation", () => {
      const result = padToPadDistanceDetailed(
        pad("a", 1e9, 1e9, 10, 4),
        pad("b", 1e9, 1e9 + 4.125, 10, 4)
      );
      expect(result.state).toBe("CONVERGED");
      if (result.state === "CONVERGED")
        expect(result.distance).toBeCloseTo(0.125, 7);
    });

    it("propagates a tiny positive pad gap through the DRC threshold comparison", () => {
      const scale = 1e-15;
      const findings = validatePcb({
        ...baselineProject,
        components: [
          {
            id: "A",
            ref: "A",
            x: 40,
            y: 40,
            footprintGeometry: {
              identifier: "FP",
              pads: [pad("A1", 0, 0, 4 * scale, 2 * scale)],
            },
          },
          {
            id: "B",
            ref: "B",
            x: 40,
            y: 40 + 2.25 * scale,
            footprintGeometry: {
              identifier: "FP",
              pads: [pad("B1", 0, 0, 4 * scale, 2 * scale)],
            },
          },
        ],
        designRules: {
          ...baselineProject.designRules,
          padToPadClearance: 0.3 * scale,
        },
      });
      expect(
        findings.some(finding => finding.ruleId === "PCB_PAD_TO_PAD_CLEARANCE")
      ).toBe(true);
      expect(
        findings.some(
          finding => finding.ruleId === "PCB_GEOMETRY_INDETERMINATE"
        )
      ).toBe(false);
    });

    it("returns INDETERMINATE for non-finite intermediate support geometry", () => {
      const hugeA = pad("huge-a", 0, 0, Number.MAX_VALUE, 1, "oval");
      const hugeB = pad("huge-b", 1, 0, Number.MAX_VALUE, 1, "oval");
      expect(gjkWithinDistance(hugeA, hugeB, 0).state).toBe("INDETERMINATE");
      const aggregate = padToPadDistanceDetailed(hugeA, hugeB);
      expect(aggregate.state).toBe("INDETERMINATE");
    });
  });

  describe("F-02: point-to-segment distance for short valid geometry", () => {
    it("keeps short non-zero segments and truly zero-length segments distinct", () => {
      // Analytic point-to-horizontal-segment distances: interior projection is 0;
      // endpoint projection is sqrt(3^2 + 4^2) = 5.
      expect(
        segmentDistance(
          { x: 1, y: 0 },
          { x: 1, y: 0 },
          { x: 1.00002, y: 0 },
          { x: 0.99999, y: 0 }
        )
      ).toBe(0);
      expect(
        segmentDistance(
          { x: 0, y: 4 },
          { x: 0, y: 4 },
          { x: 3, y: 0 },
          { x: 4, y: 0 }
        )
      ).toBe(5);
      expect(
        segmentDistance(
          { x: 2, y: 3 },
          { x: 2, y: 3 },
          { x: 1, y: 0 },
          { x: 1, y: 0 }
        )
      ).toBeCloseTo(Math.sqrt(10), 12);
      expect(
        segmentDistance(
          { x: 0, y: 0 },
          { x: 0.00003, y: 0 },
          { x: 0.000015, y: -0.00002 },
          { x: 0.000015, y: 0.00002 }
        )
      ).toBe(0);
    });

    it("detects the reported short circle-pad crossing at multiple coordinate scales", () => {
      for (const scale of [1e-4, 1, 1e4]) {
        const circle = pad("P1", 0, 0, 2 * scale, 2 * scale, "circle");
        const findings = pcbWithTrack(
          { x: 1.00002 * scale, y: 0 },
          { x: 0.99999 * scale, y: 0 },
          0.000001 * scale,
          circle,
          { x: 0, y: 0 },
          0.00001 * scale
        );
        expect(
          findings.some(
            finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE"
          ),
          `scale=${scale}`
        ).toBe(true);
      }
    });

    it("checks short track segments against via copper using the complete segment", () => {
      const findings = validatePcb({
        ...baselineProject,
        tracks: [
          {
            id: "T1",
            from: { x: 0.50002, y: 0 },
            to: { x: 0.49999, y: 0 },
            width: 0.000001,
            layer: "F.Cu",
          },
        ],
        vias: [
          {
            id: "V1",
            x: 0,
            y: 0,
            drill: 0.2,
            diameter: 1,
            layers: ["F.Cu", "B.Cu"],
          },
        ],
        designRules: {
          ...baselineProject.designRules,
          trackToViaClearance: 0.00001,
        },
      });
      expect(
        findings.some(
          finding => finding.ruleId === "PCB_TRACK_TO_VIA_CLEARANCE"
        )
      ).toBe(true);
    });

    it("checks endpoint and interior closest points with a closed-form circle oracle", () => {
      const circle = pad("P1", 0, 0, 2, 2, "circle");
      // Interior projection crosses the circle; endpoint-only projection is 0.25
      // units from its radius, before track half-width is included.
      expect(
        pcbWithTrack(
          { x: 1.1, y: 0 },
          { x: 0.9, y: 0 },
          0.02,
          circle,
          undefined,
          0.1
        ).some(finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")
      ).toBe(true);
      expect(
        pcbWithTrack(
          { x: 1.25, y: 0.25 },
          { x: 1.25, y: 0.25 },
          0.02,
          circle,
          undefined,
          0.2
        ).some(finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")
      ).toBe(false);
      expect(
        pcbWithTrack(
          { x: 1.25, y: 0.25 },
          { x: 1.25, y: 0.25 },
          0.02,
          circle,
          undefined,
          0.27
        ).some(finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")
      ).toBe(true);
    });

    it("accepts exact track-circle tangency but flags a just-below-clearance segment", () => {
      const circle = pad("P1", 0, 0, 2, 2, "circle");
      const violates = (y: number) =>
        pcbWithTrack(
          { x: -0.5, y },
          { x: 0.5, y },
          0.2,
          circle,
          undefined,
          0.3
        ).some(finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE");
      // Centerline gap is 0.4, exactly track half-width (0.1) plus rule (0.3).
      expect(violates(1.4)).toBe(false);
      expect(violates(1.399)).toBe(true);
    });

    it("uses the full segment against oval and rotated rectangle pads", () => {
      const oval = pad("O1", 0, 0, 4, 2, "oval", 30);
      const ovalFindings = pcbWithTrack(
        { x: -3, y: 0 },
        { x: 3, y: 0 },
        0.1,
        oval,
        undefined,
        0.1
      );
      expect(
        ovalFindings.some(
          finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE"
        )
      ).toBe(true);

      const rotatedRect = pad("R1", 0, 0, 4, 1, "rect", 45);
      const rectFindings = pcbWithTrack(
        { x: -3, y: 0 },
        { x: 3, y: 0 },
        0.1,
        rotatedRect,
        undefined,
        0.1
      );
      expect(
        rectFindings.some(
          finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE"
        )
      ).toBe(true);
    });
  });

  describe("F-03: via layer spans contain two distinct valid layers", () => {
    const projectWithLayers = (layers: unknown) => ({
      components: [],
      wires: [],
      tracks: [],
      vias: [{ id: "V1", x: 10, y: 10, drill: 1, diameter: 2, layers }],
    });

    it.each([
      ["F.Cu", "F.Cu"],
      ["B.Cu", "B.Cu"],
    ])("rejects duplicate via layers %j", (...layers) => {
      const checked = validateProjectJsonDetailed(projectWithLayers(layers));
      expect(checked.ok).toBe(false);
      expect(
        checked.errors.some(error => error.path === "vias[0].layers")
      ).toBe(true);
      const findings = runDesignRules(projectWithLayers(layers) as never);
      expect(findings[0]?.ruleId).toBe("PROJECT_INVALID");
      expect(findings[0]?.severity).toBe("Error");
    });

    it.each([
      ["F.Cu", "B.Cu"],
      ["B.Cu", "F.Cu"],
    ])("accepts valid through-hole layer span %j", (...layers) => {
      expect(validateProjectJsonDetailed(projectWithLayers(layers)).ok).toBe(
        true
      );
    });
  });

  describe("F-04/F-05: direct validatePcb rejects malformed input without throwing", () => {
    const invalidInputs: Array<[string, unknown]> = [
      ["null root", null],
      ["null components", { components: null, tracks: [], vias: [] }],
      ["missing tracks", { components: [], vias: [] }],
      ["non-array tracks", { components: [], tracks: {}, vias: [] }],
      ["missing vias", { components: [], tracks: [] }],
      ["non-array vias", { components: [], tracks: [], vias: null }],
      ["null component entry", { components: [null], tracks: [], vias: [] }],
      [
        "null footprint geometry",
        {
          components: [
            { id: "U1", ref: "U1", x: 0, y: 0, footprintGeometry: null },
          ],
          tracks: [],
          vias: [],
        },
      ],
      [
        "null pad entry",
        {
          components: [
            {
              id: "U1",
              ref: "U1",
              x: 0,
              y: 0,
              footprintGeometry: { identifier: "FP", pads: [null] },
            },
          ],
          tracks: [],
          vias: [],
        },
      ],
      [
        "null pad position",
        {
          components: [
            {
              id: "U1",
              ref: "U1",
              x: 0,
              y: 0,
              footprintGeometry: {
                identifier: "FP",
                pads: [
                  {
                    id: "P1",
                    number: "1",
                    position: null,
                    width: 1,
                    height: 1,
                    layer: "F.Cu",
                  },
                ],
              },
            },
          ],
          tracks: [],
          vias: [],
        },
      ],
      [
        "missing pad position",
        {
          components: [
            {
              id: "U1",
              ref: "U1",
              x: 0,
              y: 0,
              footprintGeometry: {
                identifier: "FP",
                pads: [
                  { id: "P1", number: "1", width: 1, height: 1, layer: "F.Cu" },
                ],
              },
            },
          ],
          tracks: [],
          vias: [],
        },
      ],
      [
        "malformed board dimensions",
        {
          components: [],
          tracks: [],
          vias: [],
          board: { x: 0, y: 0, width: Number.NaN, height: 20 },
        },
      ],
      [
        "non-finite track coordinates",
        {
          components: [],
          tracks: [
            {
              id: "T1",
              from: { x: Number.POSITIVE_INFINITY, y: 0 },
              to: { x: 1, y: 1 },
              width: 1,
              layer: "F.Cu",
            },
          ],
          vias: [],
        },
      ],
      [
        "non-finite pad dimension",
        {
          components: [
            {
              id: "U1",
              ref: "U1",
              x: 0,
              y: 0,
              footprintGeometry: {
                identifier: "FP",
                pads: [
                  {
                    id: "P1",
                    number: "1",
                    position: { x: 0, y: 0 },
                    width: Number.NaN,
                    height: 1,
                    layer: "F.Cu",
                  },
                ],
              },
            },
          ],
          tracks: [],
          vias: [],
        },
      ],
    ];

    it.each(invalidInputs)(
      "returns stable PCB_INVALID_INPUT for %s",
      (_label, input) => {
        expect(() => validatePcb(input as never)).not.toThrow();
        const findings = validatePcb(input as never);
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({
          ruleId: "PCB_INVALID_INPUT",
          severity: "Error",
        });
        expect(findings[0]?.explanation).toContain("PCB input is invalid");
      }
    );

    it("keeps optional board defaults and valid direct calls intact", () => {
      expect(
        validatePcb({ components: [], tracks: [], vias: [] }).some(
          finding => finding.ruleId === "PCB_INVALID_INPUT"
        )
      ).toBe(false);
    });
  });
});
