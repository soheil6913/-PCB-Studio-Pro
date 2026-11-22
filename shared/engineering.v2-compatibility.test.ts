import { describe, expect, it } from "vitest";
import {
  migrateProjectJson,
  runDesignRules,
  validatePcb,
  validateProjectJsonDetailed,
  type DrcResult,
  type EngineeringProject,
} from "./engineering";
import { v2MigrationGoldens, v2ViaCompatibilityFixtures, type V2FindingGolden } from "./engineering.v2-compatibility.fixtures";

function snapshot(findings: DrcResult[]): V2FindingGolden[] {
  return findings.map(({ id, ruleId, severity, objectIds }) => ({ id, ruleId, severity, objectIds }));
}

function validViaPairs(project: EngineeringProject) {
  return project.vias.flatMap((a, i) => project.vias.slice(i + 1).map(b => ({ a, b })));
}

describe("schema-v2 Via clearance compatibility goldens", () => {
  it.each(v2ViaCompatibilityFixtures)("$name", fixture => {
    const findings = validatePcb(fixture.project);
    expect(snapshot(findings)).toEqual(fixture.expectedFindings);
    expect(findings).toHaveLength(fixture.expectedFindings.length);

    if (fixture.hypotheticalFutureLayerSets) {
      const [a, b] = fixture.hypotheticalFutureLayerSets;
      expect(a.every(layer => !b.includes(layer))).toBe(true);
      expect(fixture.project.vias.every(via => !("futureViaSpan" in via))).toBe(true);
    }
  });

  it("matches an independent projected-2D formula for every valid pair outside the documented uncertainty band", () => {
    for (const fixture of v2ViaCompatibilityFixtures) {
      const result = fixture.expectedFindings;
      for (const { a, b } of validViaPairs(fixture.project)) {
        const effectiveDiameterA = a.diameter ?? a.drill * 2;
        const effectiveDiameterB = b.diameter ?? b.drill * 2;
        const centerDistance = Math.hypot(b.x - a.x, b.y - a.y);
        const required = effectiveDiameterA / 2 + effectiveDiameterB / 2 + fixture.project.designRules!.minimumViaClearance!;
        const referenceViolation = centerDistance < required;
        const pairOutcome = result.find(finding => finding.objectIds.length === 2 && finding.objectIds[0] === a.id && finding.objectIds[1] === b.id);

        if (fixture.expectedBoundaryState === "INDETERMINATE_WITHIN_EXISTING_UNCERTAINTY") {
          expect(referenceViolation, fixture.name).toBe(true);
          expect(pairOutcome?.ruleId, fixture.name).toBe("PCB_GEOMETRY_INDETERMINATE");
        } else {
          expect(pairOutcome?.ruleId === "PCB_VIA_TO_VIA_CLEARANCE", fixture.name).toBe(referenceViolation);
        }
      }
    }
  });

  it("does not run Via-pair clearance when the v2 rule is absent", () => {
    const project = {
      schemaVersion: 2,
      components: [],
      wires: [],
      tracks: [],
      vias: [
        { id: "no-rule-a", x: 20, y: 20, drill: 1, diameter: 4, layers: ["F.Cu", "B.Cu"] },
        { id: "no-rule-b", x: 21, y: 20, drill: 1, diameter: 4, layers: ["F.Cu", "B.Cu"] },
      ],
      board: { x: 0, y: 0, width: 100, height: 100, edgeClearance: 0 },
      designRules: {},
    } satisfies EngineeringProject;

    expect(snapshot(validatePcb(project))).toEqual([]);
  });
});

describe("schema-v2 validation and migration compatibility goldens", () => {
  it.each(v2MigrationGoldens)("$name", fixture => {
    const migrated = migrateProjectJson(fixture.input);
    expect(migrated).toEqual(fixture.expected);
    expect(validateProjectJsonDetailed(migrated)).toEqual({ ok: true, errors: [] });
  });

  it("reports non-finite Via coordinates through the existing safe-invalid-input paths", () => {
    const project = {
      schemaVersion: 2,
      components: [],
      wires: [],
      tracks: [],
      vias: [{ id: "non-finite", x: Number.POSITIVE_INFINITY, y: 20, drill: 1, diameter: 2, layers: ["F.Cu", "B.Cu"] }],
    } as unknown as EngineeringProject;

    expect(validateProjectJsonDetailed(project)).toEqual({
      ok: false,
      errors: [{ path: "vias[0]", message: "must contain finite numeric x and y" }],
    });
    expect(snapshot(validatePcb(project))).toEqual([
      { id: "PCB_INVALID_INPUT:", ruleId: "PCB_INVALID_INPUT", severity: "Error", objectIds: [] },
    ]);
    expect(snapshot(runDesignRules(project))).toEqual([
      { id: "PROJECT_INVALID:", ruleId: "PROJECT_INVALID", severity: "Error", objectIds: [] },
    ]);
  });

  it("preserves the diameter-equals-drill validation exception and Via geometry finding", () => {
    const project: EngineeringProject = {
      schemaVersion: 2,
      components: [],
      wires: [],
      tracks: [],
      vias: [{ id: "invalid-diameter", x: 20, y: 20, drill: 1, diameter: 1, layers: ["F.Cu", "B.Cu"] }],
      board: { x: 0, y: 0, width: 100, height: 100, edgeClearance: 0 },
    };

    expect(validateProjectJsonDetailed(project)).toEqual({
      ok: false,
      errors: [{ path: "vias[0].diameter", message: "must be greater than drill" }],
    });
    expect(snapshot(validatePcb(project))).toEqual([
      { id: "PCB_INVALID_VIA_GEOMETRY:invalid-diameter", ruleId: "PCB_INVALID_VIA_GEOMETRY", severity: "Error", objectIds: ["invalid-diameter"] },
    ]);
    expect(snapshot(runDesignRules(project))).toEqual([
      { id: "PROJECT_INVALID:", ruleId: "PROJECT_INVALID", severity: "Error", objectIds: [] },
    ]);
  });

  it("rejects an invalid v2 layer tuple before Via-pair DRC", () => {
    const project = {
      schemaVersion: 2,
      components: [],
      wires: [],
      tracks: [],
      vias: [{ id: "invalid-layers", x: 20, y: 20, drill: 1, diameter: 2, layers: ["F.Cu"] }],
    } as unknown as EngineeringProject;

    expect(validateProjectJsonDetailed(project)).toEqual({
      ok: false,
      errors: [{ path: "vias[0].layers", message: "must contain exactly two distinct valid copper layers" }],
    });
    expect(snapshot(validatePcb(project))).toEqual([
      { id: "PCB_INVALID_INPUT:", ruleId: "PCB_INVALID_INPUT", severity: "Error", objectIds: [] },
    ]);
    expect(snapshot(runDesignRules(project))).toEqual([
      { id: "PROJECT_INVALID:", ruleId: "PROJECT_INVALID", severity: "Error", objectIds: [] },
    ]);
  });
});


describe("schema-v2 aggregate dispatch and guarded PCB boundary", () => {
  it.each(v2ViaCompatibilityFixtures)("preserves aggregate DRC goldens: $name", fixture => {
    expect(snapshot(runDesignRules(fixture.project))).toEqual(fixture.expectedFindings);
  });

  it("keeps explicit v1, explicit v2, and versionless inputs separately accepted but geometrically compatible", () => {
    const v2 = v2ViaCompatibilityFixtures.find(fixture => fixture.name === "both explicit diameters are used")!.project;
    const v1 = { ...v2, schemaVersion: 1 } satisfies EngineeringProject;
    const versionless = { ...v2 } as EngineeringProject & { schemaVersion?: number };
    delete versionless.schemaVersion;

    const v2Findings = snapshot(runDesignRules(v2));
    expect(snapshot(runDesignRules(v1))).toEqual(v2Findings);
    expect(snapshot(runDesignRules(versionless))).toEqual(v2Findings);
    expect(validateProjectJsonDetailed(versionless).ok).toBe(true);
  });

  it.each([0, -1, 1.5, 3, 99, "2", null])("fails closed for unsupported or malformed schemaVersion %s", schemaVersion => {
    const valid = v2ViaCompatibilityFixtures[0].project;
    const project = { ...valid, schemaVersion } as unknown as EngineeringProject;

    expect(validateProjectJsonDetailed(project).ok).toBe(false);
    expect(migrateProjectJson(project)).toBeNull();
    expect(snapshot(runDesignRules(project))).toEqual([
      { id: "PROJECT_INVALID:", ruleId: "PROJECT_INVALID", severity: "Error", objectIds: [] },
    ]);
    expect(snapshot(validatePcb(project))).toEqual([
      { id: "PCB_INVALID_INPUT:", ruleId: "PCB_INVALID_INPUT", severity: "Error", objectIds: [] },
    ]);
  });

  it.each(["viaSpan", "stackup", "processEvidence", "ledger", "graph"])(
    "rejects unknown root model metadata (%s) before either DRC entry point",
    field => {
      const valid = v2ViaCompatibilityFixtures[0].project;
      const project = { ...valid, [field]: {} } as unknown as EngineeringProject;

      expect(validateProjectJsonDetailed(project).ok).toBe(false);
      expect(snapshot(runDesignRules(project))).toEqual([
        { id: "PROJECT_INVALID:", ruleId: "PROJECT_INVALID", severity: "Error", objectIds: [] },
      ]);
      expect(snapshot(validatePcb(project))).toEqual([
        { id: "PCB_INVALID_INPUT:", ruleId: "PCB_INVALID_INPUT", severity: "Error", objectIds: [] },
      ]);
    },
  );

  it("rejects ViaSpan-like nested metadata without interpreting it as a version selector", () => {
    const valid = v2ViaCompatibilityFixtures[0].project;
    const project = {
      ...valid,
      vias: valid.vias.map((via, index) => index === 0 ? { ...via, viaSpan: ["L1", "L2"] } : via),
    } as unknown as EngineeringProject;

    expect(validateProjectJsonDetailed(project).ok).toBe(false);
    expect(snapshot(runDesignRules(project))).toEqual([
      { id: "PROJECT_INVALID:", ruleId: "PROJECT_INVALID", severity: "Error", objectIds: [] },
    ]);
    expect(snapshot(validatePcb(project))).toEqual([
      { id: "PCB_INVALID_INPUT:", ruleId: "PCB_INVALID_INPUT", severity: "Error", objectIds: [] },
    ]);
  });
});
