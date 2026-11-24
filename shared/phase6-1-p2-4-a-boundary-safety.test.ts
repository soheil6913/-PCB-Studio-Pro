import { describe, expect, it } from "vitest";
import {
  migrateProjectJson,
  padToPadDistanceDetailed,
  runDesignRules,
  validatePcb,
  validateProjectJsonDetailed,
  validateSchematic,
} from "./engineering";

const base = () => ({
  schemaVersion: 2,
  components: [] as any[],
  wires: [] as any[],
  tracks: [] as any[],
  vias: [] as any[],
  board: { x: 0, y: 0, width: 300, height: 300, edgeClearance: 0 },
  designRules: {
    minimumTrackClearance: 0,
    copperToEdgeClearance: 0,
    trackToViaClearance: 0,
    viaToPadClearance: 0,
    trackToPadClearance: 0,
    padToPadClearance: 0,
  },
});

function sparseArray(length = 1): any[] {
  const value: any[] = [];
  value.length = length;
  return value;
}

function validComponent(extra: Record<string, unknown> = {}) {
  return { id: "u1", ref: "U1", x: 10, y: 10, ...extra };
}

function validPad(extra: Record<string, unknown> = {}) {
  return {
    id: "p1",
    number: "1",
    position: { x: 0, y: 0 },
    width: 2,
    height: 2,
    layer: "F.Cu",
    ...extra,
  };
}

describe("Phase 6.1 P2.4-A sparse-array boundary validation", () => {
  it.each(
    (["components", "wires", "tracks", "vias"] as const).flatMap(field =>
      [0, 1, 2].map(holeIndex => ({ field, holeIndex })),
    ),
  )(
    "rejects a sparse root $field array with a hole at index $holeIndex",
    ({ field, holeIndex }) => {
      const values: Record<typeof field, (index: number) => unknown> = {
        components: index => validComponent({ id: "c" + index, ref: "U" + index }),
        wires: index => ({ id: "w" + index, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }),
        tracks: index => ({ id: "t" + index, from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, width: 1, layer: "F.Cu" }),
        vias: index => ({ id: "v" + index, x: 0, y: 0, drill: 0.5, diameter: 1 }),
      };
      const collection = sparseArray(3);
      for (let index = 0; index < 3; index += 1) {
        if (index !== holeIndex) collection[index] = values[field](index);
      }
      const project = { ...base(), [field]: collection };
      const checked = validateProjectJsonDetailed(project);
      expect(checked.ok).toBe(false);
      expect(checked.errors).toContainEqual({
        path: field + "[" + holeIndex + "]",
        message: "must not contain sparse array holes",
      });
      expect(migrateProjectJson(project)).toBeNull();
      expect(runDesignRules(project as never)[0]?.ruleId).toBe("PROJECT_INVALID");
    },
  );

  it.each(["components", "wires", "junctions"] as const)(
    "rejects sparse %s at the schematic validation boundary",
    field => {
      const project = { ...base(), [field]: sparseArray() };
      const findings = validateSchematic(project as never);
      expect(findings[0]?.ruleId).toBe("SCH_INVALID_INPUT");
      expect(findings[0]?.explanation).toContain(field);
    },
  );

  it.each(["components", "wires", "tracks", "vias", "junctions"] as const)(
    "rejects sparse PCB root %s collections without broadening PCB field validation",
    field => {
      const project = { ...base(), [field]: sparseArray() };
      const findings = validatePcb(project as never);
      expect(findings[0]?.ruleId).toBe("PCB_INVALID_INPUT");
      expect(findings[0]?.explanation).toContain(field);
    },
  );

  it("rejects sparse component pins", () => {
    const project = {
      ...base(),
      components: [validComponent({ pins: sparseArray() })],
    };
    expect(validateProjectJsonDetailed(project).errors).toContainEqual({
      path: "components[0].pins[0]",
      message: "must not contain sparse array holes",
    });
  });

  it("rejects sparse footprint pads", () => {
    const project = {
      ...base(),
      components: [validComponent({
        footprintGeometry: { identifier: "FP", pads: sparseArray() },
      })],
    };
    expect(validateProjectJsonDetailed(project).errors).toContainEqual({
      path: "components[0].footprintGeometry.pads[0]",
      message: "must not contain sparse array holes",
    });
  });

  it("rejects sparse optional Pad layers without compacting them", () => {
    const layers = sparseArray(2);
    layers[1] = "F.Cu";
    const project = {
      ...base(),
      components: [validComponent({
        footprintGeometry: { identifier: "FP", pads: [validPad({ layers })] },
      })],
    };
    expect(validateProjectJsonDetailed(project).errors).toContainEqual({
      path: "components[0].footprintGeometry.pads[0].layers[0]",
      message: "must not contain sparse array holes",
    });
  });

  it("rejects sparse Via layer spans", () => {
    const layers = sparseArray(2);
    layers[1] = "F.Cu";
    const project = {
      ...base(),
      vias: [{ id: "v1", x: 10, y: 10, drill: 0.5, diameter: 1, layers }],
    };
    expect(validateProjectJsonDetailed(project).errors).toContainEqual({
      path: "vias[0].layers[0]",
      message: "must not contain sparse array holes",
    });
  });

  it("distinguishes an explicit undefined element from a sparse hole", () => {
    const project = { ...base(), components: [undefined] };
    const checked = validateProjectJsonDetailed(project);
    expect(checked.errors.some(error => error.path === "components[0]" && error.message === "must not contain sparse array holes")).toBe(false);
    expect(checked.errors.some(error => error.path === "components[0]" || error.path === "components[0].id")).toBe(true);
  });
});

function projectWithRotatedOvalPads() {
  const project = base();
  project.designRules.padToPadClearance = 0;
  project.components = [
    validComponent({
      x: 100,
      y: 100,
      footprintGeometry: {
        identifier: "FP1",
        pads: [validPad({ id: "p1", shape: "oval", width: 6, height: 2, rotation: 20 })],
      },
    }),
    validComponent({
      id: "u2",
      ref: "U2",
      x: 112,
      y: 108,
      footprintGeometry: {
        identifier: "FP2",
        pads: [validPad({ id: "p2", shape: "oval", width: 6, height: 2, rotation: 65 })],
      },
    }),
  ];
  return project;
}

describe("Phase 6.1 P2.4-A validatePcb geometry options", () => {
  it.each([null, [], "invalid", 7])(
    "returns a stable options diagnostic for non-object options (%s) before evaluating pad geometry",
    options => {
      const findings = validatePcb(projectWithRotatedOvalPads() as never, options as never);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("PCB_INVALID_OPTIONS");
      expect(findings[0]?.explanation).toContain("options");
      expect(findings[0]?.correction).toBe("must be a non-null object");
    },
  );

  it.each([null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "64"])(
    "rejects invalid gjkMaxIterations value (%s)",
    gjkMaxIterations => {
      const findings = validatePcb(base() as never, { gjkMaxIterations } as never);
      expect(findings[0]?.ruleId).toBe("PCB_INVALID_OPTIONS");
      expect(findings[0]?.correction).toBe("must be a positive safe integer");
    },
  );

  it("accepts omitted options, undefined, an empty object, and positive safe integer budgets", () => {
    expect(validatePcb(base() as never)).toEqual([]);
    expect(validatePcb(base() as never, undefined as never)).toEqual([]);
    expect(validatePcb(base() as never, {})).toEqual([]);
    expect(validatePcb(base() as never, { gjkMaxIterations: 1 })).toEqual([]);
    expect(validatePcb(base() as never, { gjkMaxIterations: 257 })).toEqual([]);
    expect(validatePcb(base() as never, { gjkMaxIterations: Number.MAX_SAFE_INTEGER })).toEqual([]);
  });

  it("reaches the rotated Oval-to-Oval GJK path with a valid bounded budget", () => {
    const first = validPad({
      id: "p1",
      shape: "oval",
      width: 6,
      height: 2,
      position: { x: 0, y: 0 },
      rotation: 20,
    });
    const second = validPad({
      id: "p2",
      shape: "oval",
      width: 6,
      height: 2,
      position: { x: 9, y: 6 },
      rotation: 65,
    });
    const distance = padToPadDistanceDetailed(first as never, second as never, { gjkMaxIterations: 256 });
    expect(distance.state).toBe("CONVERGED");
    if (distance.state === "CONVERGED") expect(Number.isFinite(distance.distance)).toBe(true);

    const findings = validatePcb(projectWithRotatedOvalPads() as never, { gjkMaxIterations: 256 });
    expect(findings.some(finding => finding.ruleId === "PCB_GEOMETRY_INDETERMINATE")).toBe(false);
  });

  it("rejects unknown geometry option fields instead of silently ignoring them", () => {
    const findings = validatePcb(base() as never, { timeout: 10 } as never);
    expect(findings[0]?.ruleId).toBe("PCB_INVALID_OPTIONS");
    expect(findings[0]?.explanation).toContain("options.timeout");
    expect(findings[0]?.correction).toBe("unknown field");
  });
});
