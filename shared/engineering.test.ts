import { describe, expect, it } from "vitest";
import {
  migrateProjectJson,
  measure,
  route45,
  runDesignRules,
  segmentDistance,
  segmentsIntersect,
  snapToGrid,
  validatePcb,
  validateProjectJson,
  validateProjectJsonDetailed,
  validateSchematic,
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

  it("validates duplicate IDs, invalid coordinates, invalid layers, and non-finite values", () => {
    const invalid = { ...empty, grid: Number.NaN, components: [{ id: "c", ref: "R1", x: Number.POSITIVE_INFINITY, y: 0 }, { id: "c", ref: "R2", x: 0, y: 0 }], tracks: [{ id: "t", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, width: -1, layer: "X" }], vias: [] };
    const checked = validateProjectJsonDetailed(invalid);
    expect(checked.ok).toBe(false);
    expect(checked.errors.some(error => error.path === "grid")).toBe(true);
    expect(checked.errors.some(error => error.path.includes("components[1].id"))).toBe(true);
    expect(checked.errors.some(error => error.path.includes("tracks[0].width"))).toBe(true);
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
});
