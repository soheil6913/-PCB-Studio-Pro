import { describe, expect, it } from "vitest";
import { measure, route45, runDesignRules, snapToGrid, validateProjectJson } from "./engineering";

const base = { components: [], wires: [], tracks: [], vias: [], grid: 20 };

describe("engineering core", () => {
  it("keeps both measurement points and reports grid units", () => {
    const measurement = measure({ x: 0, y: 0 }, { x: 30, y: 40 }, 10);
    expect(measurement.start).toEqual({ x: 0, y: 0 });
    expect(measurement.end).toEqual({ x: 30, y: 40 });
    expect(measurement.distance).toBe(50);
    expect(measurement.gridUnits).toBe(5);
  });

  it("snaps and creates a 45-degree route", () => {
    expect(snapToGrid({ x: 31, y: 49 }, 20)).toEqual({ x: 40, y: 40 });
    expect(route45({ x: 0, y: 0 }, { x: 80, y: 40 })).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 40 }]);
  });

  it("detects duplicate references, missing footprints, and disconnected nets", () => {
    const findings = runDesignRules({ ...base, components: [{ id: "a", ref: "R1", value: "", footprint: "Not assigned", x: 10, y: 10 }, { id: "b", ref: "R1", value: "10k", footprint: "Not assigned", x: 300, y: 300 }], wires: [{ id: "w1", from: { x: 10, y: 10 }, to: { x: 30, y: 10 }, net: "N1" }, { id: "w2", from: { x: 200, y: 200 }, to: { x: 220, y: 200 }, net: "N1" }] });
    expect(findings.some(finding => finding.ruleId === "SCH_DUPLICATE_REFERENCE")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "SCH_MISSING_FOOTPRINT")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "SCH_DISCONNECTED_NET")).toBe(true);
  });

  it("evaluates real PCB geometry", () => {
    const findings = runDesignRules({ ...base, components: [{ id: "c1", ref: "U1", value: "MCU", footprint: "FP", x: 100, y: 100 }], tracks: [{ id: "t1", from: { x: 100, y: 100 }, to: { x: 900, y: 100 }, width: 10, layer: "F.Cu" }], vias: [] });
    expect(findings.some(finding => finding.ruleId === "PCB_COMPONENT_OUTSIDE_BOARD")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "PCB_EDGE_CLEARANCE")).toBe(true);
  });

  it("rejects incomplete project JSON", () => {
    expect(validateProjectJson({ components: [] })).toBe(false);
    expect(validateProjectJson({ ...base })).toBe(true);
  });
});
