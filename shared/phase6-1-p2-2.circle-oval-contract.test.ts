import { describe, expect, it } from "vitest";
import {
  migrateProjectJson,
  padToPadDistance,
  runDesignRules,
  validatePcb,
  validateProjectJsonDetailed,
  viaToPadDistance,
} from "./engineering";

const base = {
  schemaVersion: 2,
  components: [],
  wires: [],
  tracks: [],
  vias: [],
  board: { x: 0, y: 0, width: 300, height: 300, edgeClearance: 0 },
  designRules: {
    minimumTrackClearance: 0,
    copperToEdgeClearance: 0,
    trackToViaClearance: 0,
    viaToPadClearance: 0,
    trackToPadClearance: 0,
    padToPadClearance: 0,
  },
};

function pad(shape: "circle" | "oval", width: number, height: number, extra: Record<string, unknown> = {}) {
  return {
    id: `${shape}-1`,
    number: "1",
    position: { x: 0, y: 0 },
    width,
    height,
    shape,
    layer: "F.Cu" as const,
    ...extra,
  };
}

function projectWithPad(value: ReturnType<typeof pad>) {
  return {
    ...base,
    components: [{
      id: "u1",
      ref: "U1",
      x: 100,
      y: 100,
      footprintGeometry: { identifier: "FP", pads: [value] },
    }],
  };
}

describe("Phase 6.1 P2.2 approved Circle/Oval contract", () => {
  it("accepts equal positive finite Circle dimensions", () => {
    const checked = validateProjectJsonDetailed(projectWithPad(pad("circle", 4, 4)));
    expect(checked.ok).toBe(true);
    expect(checked.errors).toEqual([]);
  });

  it.each([
    ["width smaller than height", 4, 6],
    ["width greater than height", 6, 4],
  ])("rejects Circle with %s", (_label, width, height) => {
    const checked = validateProjectJsonDetailed(projectWithPad(pad("circle", width, height)));
    expect(checked.ok).toBe(false);
    expect(checked.errors).toContainEqual({
      path: "components[0].footprintGeometry.pads[0].height",
      message: "Circle pads require equal width and height; Oval pads support independent dimensions",
    });
  });

  it.each([
    ["zero width", 0, 4, "components[0].footprintGeometry.pads[0].width"],
    ["zero height", 4, 0, "components[0].footprintGeometry.pads[0].height"],
    ["negative width", -1, 4, "components[0].footprintGeometry.pads[0].width"],
    ["negative height", 4, -1, "components[0].footprintGeometry.pads[0].height"],
    ["NaN width", Number.NaN, 4, "components[0].footprintGeometry.pads[0].width"],
    ["Infinity height", 4, Number.POSITIVE_INFINITY, "components[0].footprintGeometry.pads[0].height"],
  ])("rejects Circle with %s", (_label, width, height, path) => {
    const checked = validateProjectJsonDetailed(projectWithPad(pad("circle", width, height)));
    expect(checked.ok).toBe(false);
    expect(checked.errors.some(error => error.path === path && error.message === "must be positive and finite")).toBe(true);
  });

  it("uses a stable, Pad-specific diagnostic for unequal Circle dimensions", () => {
    const invalid = projectWithPad(pad("circle", 4, 5));
    const first = validateProjectJsonDetailed(invalid);
    const second = validateProjectJsonDetailed(invalid);
    expect(first.errors).toEqual(second.errors);
    expect(first.errors.filter(error => error.message.includes("Circle pads require equal width and height"))).toHaveLength(1);
    expect(first.errors[0]).toEqual({
      path: "components[0].footprintGeometry.pads[0].height",
      message: "Circle pads require equal width and height; Oval pads support independent dimensions",
    });
  });

  it("rejects missing or malformed Circle dimensions through the established field validation", () => {
    const missing = projectWithPad({ ...pad("circle", 4, 4), height: undefined } as any);
    const malformed = projectWithPad({ ...pad("circle", 4, 4), shape: "circle", width: "4" } as any);
    const missingChecked = validateProjectJsonDetailed(missing);
    const malformedChecked = validateProjectJsonDetailed(malformed);
    expect(missingChecked.errors.some(error => error.path.endsWith(".height"))).toBe(true);
    expect(malformedChecked.errors.some(error => error.path.endsWith(".width"))).toBe(true);
  });

  it("accepts unequal and equal positive Oval dimensions", () => {
    expect(validateProjectJsonDetailed(projectWithPad(pad("oval", 4, 6))).ok).toBe(true);
    expect(validateProjectJsonDetailed(projectWithPad(pad("oval", 4, 4))).ok).toBe(true);
  });

  it.each([
    ["zero width", 0, 6, "width"],
    ["negative height", 4, -1, "height"],
    ["NaN width", Number.NaN, 6, "width"],
    ["Infinity height", 4, Number.POSITIVE_INFINITY, "height"],
  ])("rejects Oval with independently invalid %s", (_label, width, height, field) => {
    const checked = validateProjectJsonDetailed(projectWithPad(pad("oval", width, height)));
    expect(checked.ok).toBe(false);
    expect(checked.errors.some(error => error.path.endsWith(`.${field}`) && error.message === "must be positive and finite")).toBe(true);
  });

  it("preserves the single-diameter Circle and independent-dimension Oval geometry", () => {
    const circle = pad("circle", 4, 4);
    const oval = pad("oval", 4, 2);
    expect(viaToPadDistance(circle, { id: "v1", x: 3, y: 0, drill: 1, diameter: 1 })).toBeCloseTo(0.5, 10);
    expect(viaToPadDistance(oval, { id: "v2", x: 0, y: 2, drill: 1, diameter: 1 })).toBeCloseTo(0.5, 10);
    expect(padToPadDistance(circle, { ...oval, id: "oval-2", position: { x: 6, y: 0 } })).toBeCloseTo(2, 8);
  });

  it("uses the approved shape semantics in point, segment, and Pad-to-Pad DRC paths", () => {
    const circle = pad("circle", 4, 4);
    const oval = pad("oval", 4, 2);
    const pointClear = viaToPadDistance(circle, { id: "clear", x: 5, y: 0, drill: 1, diameter: 1 });
    expect(pointClear).toBeCloseTo(2.5, 10);

    const trackProject = {
      ...projectWithPad(oval),
      tracks: [{ id: "t1", from: { x: 100, y: 102.4 }, to: { x: 110, y: 102.4 }, width: 0.2, layer: "F.Cu" as const }],
      designRules: { ...base.designRules, trackToPadClearance: 0.29 },
    };
    expect(validatePcb(trackProject).some(finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(false);

    const padProject = {
      ...base,
      components: [
        { id: "c", ref: "C1", x: 100, y: 100, footprintGeometry: { identifier: "C", pads: [circle] } },
        { id: "o", ref: "O1", x: 106, y: 100, footprintGeometry: { identifier: "O", pads: [oval] } },
      ],
      designRules: { ...base.designRules, padToPadClearance: 3.01 },
    };
    expect(validatePcb(padProject).some(finding => finding.ruleId === "PCB_PAD_TO_PAD_CLEARANCE")).toBe(true);
  });

  it("fails safely at the DRC validation boundary for malformed unequal Circle input", () => {
    const findings = runDesignRules(projectWithPad(pad("circle", 4, 5)) as never);
    expect(findings[0]?.ruleId).toBe("PROJECT_INVALID");
    expect(findings[0]?.severity).toBe("Error");
    expect(findings[0]?.explanation).toContain("footprintGeometry.pads[0].height");
  });

  it("preserves valid Circle and unequal Oval dimensions through JSON round-trip and migration", () => {
    const project = {
      ...projectWithPad(pad("circle", 4, 4)),
      components: [
        projectWithPad(pad("circle", 4, 4)).components[0],
        { id: "u2", ref: "U2", x: 120, y: 100, footprintGeometry: { identifier: "FP2", pads: [pad("oval", 4, 6)] } },
      ],
    };
    const roundTrip = migrateProjectJson(JSON.parse(JSON.stringify(project)));
    expect(roundTrip?.components[0]?.footprintGeometry?.pads[0]).toMatchObject({ shape: "circle", width: 4, height: 4 });
    expect(roundTrip?.components[1]?.footprintGeometry?.pads[0]).toMatchObject({ shape: "oval", width: 4, height: 6 });
  });

  it("does not make invalid unequal Circle data valid through serialization or migration", () => {
    const invalid = projectWithPad(pad("circle", 4, 5));
    const serialized = JSON.parse(JSON.stringify(invalid));
    expect(validateProjectJsonDetailed(serialized).ok).toBe(false);
    expect(migrateProjectJson(serialized)).toBe(null);
  });
});
