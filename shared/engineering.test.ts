import { describe, expect, it } from "vitest";
import {
  CONNECT_TOLERANCE,
  migrateProjectJson,
  measure,
  transformLocalPoint,
  route45,
  runDesignRules,
  segmentDistance,
  segmentsIntersect,
  snapToGrid,
  validatePcb,
  validateProjectJson,
  validateProjectJsonDetailed,
  validateSchematic,
  viaToPadDistance,
} from "./engineering";

const board = { x: 0, y: 0, width: 300, height: 300, edgeClearance: 5 };
const rules = { minimumTrackClearance: 5, copperToEdgeClearance: 5, trackToViaClearance: 5, trackToPadClearance: 5, padToPadClearance: 5 };
const empty = { components: [], wires: [], tracks: [], vias: [], grid: 20, board, designRules: rules };

describe("engineering core", () => {
  it("keeps both measurement points and reports grid units", () => {
    const value = measure({ x: 0, y: 0 }, { x: 30, y: 40 }, 10);
    expect(value.start).toEqual({ x: 0, y: 0 });
    expect(value.end).toEqual({ x: 30, y: 40 });
    expect(value.distance).toBe(50);
    expect(value.gridUnits).toBe(5);
  });

  it("snaps and creates a 45-degree route", () => {
    expect(snapToGrid({ x: 31, y: 49 }, 20)).toEqual({ x: 40, y: 40 });
    expect(route45({ x: 0, y: 0 }, { x: 80, y: 40 })).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 40 }]);
  });

  it("detects perpendicular crossings, endpoint touching, collinear overlap, and zero-length segments", () => {
    expect(segmentsIntersect({ x: 0, y: 10 }, { x: 20, y: 10 }, { x: 10, y: 0 }, { x: 10, y: 20 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 })).toBe(true);
    expect(segmentDistance({ x: 4, y: 4 }, { x: 4, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(4);
  });

  it("separates parallel clearance, sufficient spacing, and copper layers", () => {
    const insufficient = validatePcb({ ...empty, tracks: [{ id: "a", from: { x: 40, y: 80 }, to: { x: 240, y: 80 }, width: 2, layer: "F.Cu" }, { id: "b", from: { x: 40, y: 84 }, to: { x: 240, y: 84 }, width: 2, layer: "F.Cu" }] });
    expect(insufficient.some(finding => finding.ruleId === "PCB_TRACK_CLEARANCE")).toBe(true);
    const sufficient = validatePcb({ ...empty, tracks: [{ id: "a", from: { x: 40, y: 120 }, to: { x: 240, y: 120 }, width: 2, layer: "F.Cu" }, { id: "b", from: { x: 40, y: 132 }, to: { x: 240, y: 132 }, width: 2, layer: "F.Cu" }] });
    expect(sufficient.some(finding => finding.ruleId === "PCB_TRACK_CLEARANCE")).toBe(false);
    const differentLayer = validatePcb({ ...empty, tracks: [{ id: "a", from: { x: 40, y: 160 }, to: { x: 240, y: 160 }, width: 2, layer: "F.Cu" }, { id: "b", from: { x: 40, y: 160 }, to: { x: 240, y: 160 }, width: 2, layer: "B.Cu" }] });
    expect(differentLayer.some(finding => finding.ruleId === "PCB_TRACK_CLEARANCE")).toBe(false);
  });

  it("checks full track boundary geometry and via geometry", () => {
    const findings = validatePcb({ ...empty, tracks: [{ id: "outside", from: { x: 20, y: 20 }, to: { x: 320, y: 20 }, width: 2, layer: "F.Cu" }], vias: [{ id: "bad-via", x: 2, y: 2, drill: 1, diameter: 1 }] });
    expect(findings.some(finding => finding.ruleId === "PCB_EDGE_CLEARANCE")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "PCB_INVALID_VIA_GEOMETRY")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "PCB_VIA_EDGE_CLEARANCE")).toBe(true);
  });

  it("transforms footprint pads and evaluates track-to-pad and pad-to-pad clearance", () => {
    const findings = validatePcb({ ...empty, components: [{ id: "u1", ref: "U1", value: "IC", footprint: "FP", x: 100, y: 100, rotation: 90, footprintGeometry: { identifier: "FP", pads: [{ id: "1", number: "1", position: { x: 10, y: 0 }, width: 8, height: 8, layer: "F.Cu" }, { id: "2", number: "2", position: { x: 14, y: 0 }, width: 8, height: 8, layer: "F.Cu" }] } }], tracks: [{ id: "t1", from: { x: 90, y: 110 }, to: { x: 120, y: 110 }, width: 2, layer: "F.Cu" }] });
    expect(findings.some(finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "PCB_PAD_TO_PAD_CLEARANCE")).toBe(true);
  });

  it("uses explicit pin geometry rather than component-center proximity", () => {
    const components = [{ id: "u1", ref: "U1", value: "MCU", x: 100, y: 100, pins: [{ id: "p1", number: "1", name: "IO", position: { x: 20, y: 0 }, required: true }] }];
    const connected = validateSchematic({ components, wires: [{ id: "w1", from: { x: 120, y: 100 }, to: { x: 160, y: 100 }, net: "N1" }] });
    expect(connected.some(finding => finding.ruleId === "SCH_UNCONNECTED_REQUIRED_PIN")).toBe(false);
    const disconnected = validateSchematic({ components, wires: [{ id: "w1", from: { x: 100, y: 100 }, to: { x: 110, y: 100 }, net: "N1" }] });
    expect(disconnected.some(finding => finding.ruleId === "SCH_UNCONNECTED_REQUIRED_PIN")).toBe(true);
  });

  it("detects wire crossings without junctions and disconnected net segments", () => {
    const findings = validateSchematic({ components: [], wires: [{ id: "a", from: { x: 0, y: 10 }, to: { x: 20, y: 10 }, net: "N1" }, { id: "b", from: { x: 10, y: 0 }, to: { x: 10, y: 20 }, net: "N2" }, { id: "c", from: { x: 100, y: 100 }, to: { x: 120, y: 100 }, net: "N1" }] });
    expect(findings.some(finding => finding.ruleId === "SCH_CROSSING_WITHOUT_JUNCTION")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "SCH_DISCONNECTED_NET")).toBe(true);
  });

  it("builds a three-wire chain, supports a junction branch, and reports conflicting net names", () => {
    const chained = validateSchematic({ components: [], wires: [{ id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, net: "N1" }, { id: "b", from: { x: 10, y: 0 }, to: { x: 20, y: 0 }, net: "N1" }, { id: "c", from: { x: 20, y: 0 }, to: { x: 30, y: 0 }, net: "N1" }] });
    expect(chained.some(finding => finding.ruleId === "SCH_DISCONNECTED_NET")).toBe(false);
    const branch = validateSchematic({ components: [], junctions: [{ x: 10, y: 10 }], wires: [{ id: "a", from: { x: 0, y: 10 }, to: { x: 20, y: 10 }, net: "N1" }, { id: "b", from: { x: 10, y: 0 }, to: { x: 10, y: 20 }, net: "N1" }] });
    expect(branch.some(finding => finding.ruleId === "SCH_CROSSING_WITHOUT_JUNCTION")).toBe(false);
    const conflict = validateSchematic({ components: [], wires: [{ id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, net: "VCC" }, { id: "b", from: { x: 10, y: 0 }, to: { x: 20, y: 0 }, net: "GND" }] });
    expect(conflict.some(finding => finding.ruleId === "SCH_NET_NAME_CONFLICT")).toBe(true);
  });

  it("does not merge separated wires that happen to share a net label", () => {
    const findings = validateSchematic({ components: [], wires: [{ id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, net: "DATA" }, { id: "b", from: { x: 100, y: 0 }, to: { x: 110, y: 0 }, net: "DATA" }] });
    expect(findings.filter(finding => finding.ruleId === "SCH_DISCONNECTED_NET")).toHaveLength(1);
  });

  it("validates duplicate IDs, invalid coordinates, invalid layers, and non-finite values", () => {
    const invalid = { ...empty, grid: Number.NaN, components: [{ id: "c", ref: "R1", x: Number.POSITIVE_INFINITY, y: 0 }, { id: "c", ref: "R2", x: 0, y: 0 }], tracks: [{ id: "t", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, width: -1, layer: "X" }], vias: [] };
    const checked = validateProjectJsonDetailed(invalid);
    expect(checked.ok).toBe(false);
    expect(checked.errors.some(error => error.path === "grid")).toBe(true);
    expect(checked.errors.some(error => error.path.includes("components[1].id"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("tracks[0].width"))).toBe(true);
  });

  it("rejects unknown future versions, null nested data, and malformed footprint pads", () => {
    expect(validateProjectJsonDetailed({ schemaVersion: 99, components: [], wires: [], tracks: [], vias: [] }).ok).toBe(false);
    expect(validateProjectJsonDetailed({ components: null, wires: [], tracks: [], vias: [] }).ok).toBe(false);
    const malformed = validateProjectJsonDetailed({ components: [{ id: "u", ref: "U1", x: 0, y: 0, footprintGeometry: { identifier: "FP", pads: [{ id: "1", number: "1", position: null, width: 0, height: 1, layer: "F.Cu" }] } }], wires: [], tracks: [], vias: [] });
    expect(malformed.errors.some(error => error.path.includes("footprintGeometry.pads[0].position"))).toBe(true);
  });

  it("fails DRC safely on malformed runtime project data", () => {
    const findings = runDesignRules({ components: null, wires: [], tracks: [], vias: [] } as never);
    expect(findings[0]?.ruleId).toBe("PROJECT_INVALID");
    expect(findings[0]?.severity).toBe("Error");
  });

  it("migrates legacy projects with absent optional arrays and rejects corrupted roots", () => {
    const legacy = { projectName: "legacy", components: [], grid: 10 };
    const migrated = migrateProjectJson(legacy);
    expect(migrated?.wires).toEqual([]);
    expect(migrated?.tracks).toEqual([]);
    expect(migrated?.vias).toEqual([]);
    expect(validateProjectJson(migrated)).toBe(true);
    expect(migrateProjectJson({ components: "not-an-array" })).toBe(null);
  });

  it("runs both schematic and PCB rules through the aggregate engine", () => {
    const findings = runDesignRules({ ...empty, components: [{ id: "u", ref: "U1", x: 20, y: 20 }] });
    expect(findings.some(finding => finding.ruleId === "SCH_UNVERIFIED_PIN_GEOMETRY")).toBe(true);
  });

  it("accounts for independent rectangular and oval pad rotation after component rotation", () => {
    const rotatedRect = validatePcb({ ...empty, components: [{ id: "A", ref: "A", x: 0, y: 0, rotation: 45, footprintGeometry: { identifier: "FP", pads: [{ id: "A-1", number: "1", position: { x: 0, y: 0 }, width: 20, height: 4, shape: "rect", layer: "F.Cu", rotation: 45 }] } }, { id: "B", ref: "B", x: 8, y: 6, footprintGeometry: { identifier: "FP", pads: [{ id: "B-1", number: "1", position: { x: 0, y: 0 }, width: 20, height: 4, shape: "rect", layer: "F.Cu" }] } }] });
    expect(rotatedRect.some(finding => finding.ruleId === "PCB_PAD_TO_PAD_CLEARANCE")).toBe(true);
    const rotatedOval = validatePcb({ ...empty, components: [{ id: "O1", ref: "O1", x: 0, y: 0, footprintGeometry: { identifier: "FP", pads: [{ id: "O1-1", number: "1", position: { x: 0, y: 0 }, width: 20, height: 4, shape: "oval", layer: "F.Cu", rotation: 90 }] } }, { id: "O2", ref: "O2", x: 8, y: 6, footprintGeometry: { identifier: "FP", pads: [{ id: "O2-1", number: "1", position: { x: 0, y: 0 }, width: 20, height: 4, shape: "oval", layer: "F.Cu" }] } }] });
    expect(rotatedOval.some(finding => finding.ruleId === "PCB_PAD_TO_PAD_CLEARANCE")).toBe(true);
  });

  it("validates junctions and all nested pin, pad, footprint, and courtyard fields", () => {
    const checked = validateProjectJsonDetailed({ schemaVersion: 2, components: [{ id: "u", ref: "U1", x: 0, y: 0, pins: [{ id: "p", number: 1, name: null, position: { x: 0, y: 0 } }], footprintGeometry: { identifier: "", pads: [{ id: "p", number: "1", position: { x: 0, y: 0 }, width: 1, height: 1, layer: "F.Cu", shape: "bad", rotation: "no" }], courtyard: { width: 0, height: -1 } } }], wires: [], tracks: [], vias: [], junctions: [{ x: 0, y: Number.NaN }] });
    expect(checked.errors.some(error => error.path === "junctions[0]")).toBe(true);
    expect(checked.errors.some(error => error.path.includes("pins[0].number"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("footprintGeometry.identifier"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("courtyard.width"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("pads[0].shape"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("pads[0].rotation"))).toBe(true);
  });

  it("does not connect a required pin across a visible gap larger than topology tolerance", () => {
    const findings = validateSchematic({ components: [{ id: "u", ref: "U1", value: "X", x: 0, y: 0, pins: [{ id: "p", number: "1", name: "P", position: { x: 0, y: 0 }, required: true }] }], wires: [{ id: "w", from: { x: 0.5, y: 0 }, to: { x: 10, y: 0 } }] });
    expect(findings.some(finding => finding.ruleId === "SCH_UNCONNECTED_REQUIRED_PIN")).toBe(true);
    const withinTolerance = validateSchematic({ components: [{ id: "u", ref: "U1", value: "X", x: 0, y: 0, pins: [{ id: "p", number: "1", name: "P", position: { x: 0, y: 0 }, required: true }] }], wires: [{ id: "w", from: { x: CONNECT_TOLERANCE / 2, y: 0 }, to: { x: 10, y: 0 } }] });
    expect(withinTolerance.some(finding => finding.ruleId === "SCH_UNCONNECTED_REQUIRED_PIN")).toBe(false);
  });

  it("checks pads across different components and respects layer-specific track and via connectivity", () => {
    const component = (id: string, x: number, layer: "F.Cu" | "B.Cu") => ({ id, ref: id, x, y: 150, footprintGeometry: { identifier: "FP", pads: [{ id: `${id}-1`, number: "1", position: { x: 0, y: 0 }, width: 10, height: 6, shape: "rect" as const, layer }] } });
    const padFindings = validatePcb({ ...empty, components: [component("U1", 100, "F.Cu"), component("U2", 108, "F.Cu")] });
    expect(padFindings.some(finding => finding.ruleId === "PCB_PAD_TO_PAD_CLEARANCE" && finding.objectIds.includes("U1-1") && finding.objectIds.includes("U2-1"))).toBe(true);
    const otherLayer = validatePcb({ ...empty, components: [component("U1", 100, "F.Cu")], tracks: [{ id: "back", from: { x: 95, y: 150 }, to: { x: 105, y: 150 }, width: 2, layer: "B.Cu" }] });
    expect(otherLayer.some(finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(false);
    const through = { id: "TH1", ref: "J1", x: 150, y: 150, footprintGeometry: { identifier: "TH", pads: [{ id: "1", number: "1", position: { x: 0, y: 0 }, width: 10, height: 10, shape: "circle" as const, layer: "F.Cu" as const, layers: ["F.Cu", "B.Cu"] as ("F.Cu" | "B.Cu")[], drill: 2, plated: true }] } };
    const frontTrack = validatePcb({ ...empty, components: [through], tracks: [{ id: "front", from: { x: 140, y: 150 }, to: { x: 160, y: 150 }, width: 2, layer: "F.Cu" }] });
    expect(frontTrack.some(finding => finding.ruleId === "PCB_TRACK_TO_PAD_CLEARANCE")).toBe(true);
  });

  it("computes Via-to-Pad distance from exact rect, oval, and circle geometry", () => {
    const via = { id: "v", x: 8, y: 0, drill: 2, diameter: 2, layers: ["F.Cu", "B.Cu"] as ["F.Cu", "B.Cu"] };
    const rect = { id: "r", number: "1", position: { x: 0, y: 0 }, width: 10, height: 6, shape: "rect" as const, layer: "F.Cu" as const };
    expect(viaToPadDistance(rect, via)).toBeCloseTo(2, 6);
    const oval = { id: "o", number: "1", position: { x: 0, y: 5 }, width: 10, height: 4, shape: "oval" as const, layer: "F.Cu" as const };
    expect(viaToPadDistance(oval, { ...via, x: 0, y: 10 })).toBeCloseTo(2, 6);
    const circle = { id: "c", number: "1", position: { x: 0, y: 0 }, width: 10, height: 10, shape: "circle" as const, layer: "F.Cu" as const };
    expect(viaToPadDistance(circle, { ...via, x: 7, y: 0 })).toBeCloseTo(1, 6);
  });

  it("returns zero clearance for containment and handles tangency, positive gap, and oversized vias", () => {
    const circle = { id: "circle", number: "1", position: { x: 0, y: 0 }, width: 10, height: 10, shape: "circle" as const, layer: "F.Cu" as const };
    const oval = { id: "oval", number: "1", position: { x: 0, y: 0 }, width: 12, height: 6, shape: "oval" as const, layer: "F.Cu" as const };
    const viaAt = (id: string, x: number, y: number, diameter = 2) => ({ id, x, y, drill: diameter / 2, diameter, layers: ["F.Cu", "B.Cu"] as ["F.Cu", "B.Cu"] });
    const drc = (pad: typeof circle | typeof oval, via: ReturnType<typeof viaAt>, clearance: number) => validatePcb({ ...empty, designRules: { ...rules, viaToPadClearance: clearance }, components: [{ id: "u", ref: "U1", x: 100, y: 100, footprintGeometry: { identifier: "FP", pads: [{ ...pad, position: { x: pad.position.x, y: pad.position.y } }] } }], vias: [{ ...via, x: via.x + 100, y: via.y + 100 }] });

    const centerCircle = viaToPadDistance(circle, viaAt("center-circle", 0, 0));
    expect(centerCircle).toBe(0);
    expect(drc(circle, viaAt("center-circle", 0, 0), 0.01).some(finding => finding.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(true);

    const centerOval = viaToPadDistance(oval, viaAt("center-oval", 0, 0));
    expect(centerOval).toBe(0);
    expect(drc(oval, viaAt("center-oval", 0, 0), 0.01).some(finding => finding.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(true);

    const insideCircle = viaToPadDistance(circle, viaAt("inside-circle", 3, 0));
    expect(insideCircle).toBe(0);
    expect(drc(circle, viaAt("inside-circle", 3, 0), 0.01).some(finding => finding.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(true);

    const tangentCircle = viaToPadDistance(circle, viaAt("tangent-circle", 6, 0));
    expect(tangentCircle).toBeCloseTo(0, 8);
    expect(drc(circle, viaAt("tangent-circle", 6, 0), 0.01).some(finding => finding.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(true);

    const positiveCircle = viaToPadDistance(circle, viaAt("positive-circle", 8, 0));
    expect(positiveCircle).toBeCloseTo(2, 6);
    expect(drc(circle, viaAt("positive-circle", 8, 0), 1.99).some(finding => finding.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(false);
    expect(drc(circle, viaAt("positive-circle", 8, 0), 2.01).some(finding => finding.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(true);

    const oversizedVia = viaToPadDistance(circle, viaAt("oversized", 0, 0, 14));
    expect(oversizedVia).toBe(0);
    expect(drc(circle, viaAt("oversized", 0, 0, 14), 0.01).some(finding => finding.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(true);
  });

  it("changes Via-to-Pad clearance when pad shape and combined rotation change", () => {
    const componentRotation = 90;
    const padRotation = 45;
    const worldPad = { id: "rot", number: "1", position: transformLocalPoint({ x: 20, y: 20 }, { x: 4, y: 0 }, componentRotation), width: 12, height: 2, shape: "rect" as const, layer: "F.Cu" as const, rotation: componentRotation + padRotation };
    const via = { id: "vr", x: 20, y: 35, drill: 2, diameter: 2, layers: ["F.Cu", "B.Cu"] as ["F.Cu", "B.Cu"] };
    const rotatedDistance = viaToPadDistance(worldPad, via);
    const unrotatedDistance = viaToPadDistance({ ...worldPad, rotation: 0 }, via);
    expect(rotatedDistance).not.toBeCloseTo(unrotatedDistance, 4);
    const below = validatePcb({ ...empty, designRules: { ...rules, viaToPadClearance: rotatedDistance - 0.01 }, components: [{ id: "u", ref: "U1", x: 20, y: 20, rotation: componentRotation, footprintGeometry: { identifier: "FP", pads: [{ id: "rot", number: "1", position: { x: 4, y: 0 }, width: 12, height: 2, shape: "rect", layer: "F.Cu", rotation: padRotation }] } }], vias: [via] });
    expect(below.some(finding => finding.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(false);
    const above = validatePcb({ ...empty, designRules: { ...rules, viaToPadClearance: rotatedDistance + 0.01 }, components: [{ id: "u", ref: "U1", x: 20, y: 20, rotation: componentRotation, footprintGeometry: { identifier: "FP", pads: [{ id: "rot", number: "1", position: { x: 4, y: 0 }, width: 12, height: 2, shape: "rect", layer: "F.Cu", rotation: padRotation }] } }], vias: [via] });
    expect(above.some(finding => finding.ruleId === "PCB_VIA_TO_PAD_CLEARANCE")).toBe(true);
  });

  it("rejects malformed JSON fields, duplicate IDs, invalid layers, and unknown keys", () => {
    const checked = validateProjectJsonDetailed({ components: [{ id: "c", ref: "R1", x: 0, y: 0, unknownComponent: true }, { id: "c", ref: "R2", x: 0, y: 0 }], wires: [{ id: "w", from: null, to: [], net: 42, unknownWire: true }], tracks: [{ id: "t", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, width: 0, layer: "Inner", net: null }], vias: [{ id: "v", x: 0, y: 0, drill: 1, layers: ["F.Cu"], unknownVia: true }], junctions: [{}], designRules: { viaToPadClearance: "1", unknownRule: 2 } });
    expect(checked.ok).toBe(false);
    expect(checked.errors.some(error => error.path.includes("components[0].unknownComponent"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("components[1].id"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("wires[0].from"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("wires[0].net"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("tracks[0].layer"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("vias[0].layers"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("junctions[0]"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("designRules.unknownRule"))).toBe(true);
  });
});
