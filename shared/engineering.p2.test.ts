import { describe, expect, it } from "vitest";
import {
  migrateProjectJson,
  runDesignRules,
  validateSchematic,
  validateProjectJsonDetailed,
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

  it("treats an explicitly present undefined grid as invalid in both validation paths", () => {
    const base = { components: [], wires: [], tracks: [], vias: [] };
    const absent = validateProjectJsonDetailed(base);
    expect(absent.ok).toBe(true);
    expect(migrateProjectJson(base)).toMatchObject({ grid: 20 });

    const invalidValues: unknown[] = [undefined, null, 0, -1, "20", Number.NaN, Number.POSITIVE_INFINITY];
    for (const grid of invalidValues) {
      const input = { ...base, grid };
      expect(validateProjectJsonDetailed(input).errors.some(error => error.path === "grid")).toBe(true);
      expect(migrateProjectJson(input)).toBeNull();
    }

    const valid = { ...base, grid: 12.5 };
    expect(validateProjectJsonDetailed(valid)).toEqual({ ok: true, errors: [] });
    expect(migrateProjectJson(valid)).toMatchObject({ grid: 12.5 });
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
