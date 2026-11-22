import { describe, expect, it } from "vitest";
import {
  migrateProjectJson,
  runDesignRules,
  validateSchematic,
} from "./engineering";

describe("Phase 6.1 P2 validation remediations", () => {
  it("defaults only absent legacy migration fields and rejects explicit null or invalid values", () => {
    const absent = migrateProjectJson({ projectName: "legacy" });
    expect(absent).toMatchObject({ schemaVersion: 2, components: [], wires: [], tracks: [], vias: [], grid: 20 });

    for (const field of ["components", "wires", "tracks", "vias", "grid"]) {
      expect(migrateProjectJson({ [field]: null })).toBeNull();
    }
    expect(migrateProjectJson({ components: {}, wires: [], tracks: [], vias: [] })).toBeNull();
    expect(migrateProjectJson({ components: [], wires: [], tracks: [], vias: [], grid: "20" })).toBeNull();
    expect(migrateProjectJson({ components: [], wires: [], tracks: [], vias: [], grid: 0 })).toBeNull();
    expect(migrateProjectJson({ components: [], wires: [], tracks: [], vias: [], grid: 12 })).toMatchObject({ grid: 12 });
  });

  it("returns one stable invalid-input finding instead of throwing for malformed direct schematic calls", () => {
    const malformedInputs: unknown[] = [
      null,
      undefined,
      [],
      {},
      { components: null, wires: [] },
      { components: [], wires: null },
      { components: [null], wires: [] },
      { components: [], wires: [null] },
      { components: [{ id: "u", ref: "U1", x: 0, y: 0, pins: [null] }], wires: [] },
      { components: [], wires: [], junctions: [null] },
    ];

    for (const input of malformedInputs) {
      let findings: ReturnType<typeof validateSchematic> | undefined;
      expect(() => { findings = validateSchematic(input as never); }).not.toThrow();
      expect(findings).toHaveLength(1);
      expect(findings?.[0]).toMatchObject({
        id: "SCH_INVALID_INPUT:",
        ruleId: "SCH_INVALID_INPUT",
        severity: "Error",
        objectIds: [],
      });
    }
  });

  it("keeps aggregate malformed-project handling on PROJECT_INVALID without duplicate schematic findings", () => {
    const findings = runDesignRules({ components: null, wires: [], tracks: [], vias: [] } as never);
    expect(findings.filter(finding => finding.ruleId === "PROJECT_INVALID")).toHaveLength(1);
    expect(findings.some(finding => finding.ruleId === "SCH_INVALID_INPUT")).toBe(false);
    expect(findings.map(finding => finding.id)).toEqual(["PROJECT_INVALID:"]);
  });
});
