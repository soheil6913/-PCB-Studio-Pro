import type { DrcResult, EngineeringProject, EngineeringVia } from "./engineering";

export type V2FindingGolden = Pick<DrcResult, "id" | "ruleId" | "severity" | "objectIds">;

export type V2ViaCompatibilityFixture = {
  name: string;
  project: EngineeringProject;
  expectedFindings: V2FindingGolden[];
  /** Test-only description of a future model; never part of the schema-v2 project. */
  hypotheticalFutureLayerSets?: readonly [readonly string[], readonly string[]];
  /** This case is intentionally one floating-point step inside the required boundary. */
  expectedBoundaryState?: "INDETERMINATE_WITHIN_EXISTING_UNCERTAINTY";
};

const board = { x: 0, y: 0, width: 100, height: 100, edgeClearance: 0 };

function via(
  id: string,
  x: number,
  drill: number,
  diameter?: number,
  layers: EngineeringVia["layers"] = ["F.Cu", "B.Cu"],
): EngineeringVia {
  const value: EngineeringVia = { id, x, y: 20, drill };
  if (diameter !== undefined) value.diameter = diameter;
  if (layers !== undefined) value.layers = layers;
  return value;
}

function viaWithoutLayers(id: string, x: number, drill: number): EngineeringVia {
  const value = via(id, x, drill);
  delete value.layers;
  return value;
}

function project(vias: EngineeringVia[], minimumViaClearance = 1): EngineeringProject {
  return {
    schemaVersion: 2,
    projectName: "v2-via-clearance-golden",
    components: [],
    wires: [],
    tracks: [],
    vias,
    board,
    designRules: { minimumViaClearance },
  };
}

export const v2ViaCompatibilityFixtures: V2ViaCompatibilityFixture[] = [
  {
    name: "overlapping Vias without layers still emit the v2 pair finding",
    project: project([viaWithoutLayers("overlap-a", 20, 1), viaWithoutLayers("overlap-b", 22, 1)]),
    expectedFindings: [
      { id: "PCB_VIA_LAYER_SPAN_UNAVAILABLE:overlap-a", ruleId: "PCB_VIA_LAYER_SPAN_UNAVAILABLE", severity: "Info", objectIds: ["overlap-a"] },
      { id: "PCB_VIA_LAYER_SPAN_UNAVAILABLE:overlap-b", ruleId: "PCB_VIA_LAYER_SPAN_UNAVAILABLE", severity: "Info", objectIds: ["overlap-b"] },
      { id: "PCB_VIA_TO_VIA_CLEARANCE:overlap-a,overlap-b", ruleId: "PCB_VIA_TO_VIA_CLEARANCE", severity: "Error", objectIds: ["overlap-a", "overlap-b"] },
    ],
  },
  {
    name: "close Vias with different valid v2 layer ordering remain pair-applicable",
    project: project([
      via("ordered-a", 20, 1, 4, ["F.Cu", "B.Cu"]),
      via("ordered-b", 24.5, 1, 4, ["B.Cu", "F.Cu"]),
    ]),
    expectedFindings: [
      { id: "PCB_VIA_TO_VIA_CLEARANCE:ordered-a,ordered-b", ruleId: "PCB_VIA_TO_VIA_CLEARANCE", severity: "Error", objectIds: ["ordered-a", "ordered-b"] },
    ],
  },
  {
    name: "hypothetically disjoint future spans do not gate v2 projected clearance",
    project: project([
      via("future-a", 20, 1, 4, ["F.Cu", "B.Cu"]),
      via("future-b", 23, 1, 4, ["B.Cu", "F.Cu"]),
    ]),
    hypotheticalFutureLayerSets: [["L2.Cu", "L3.Cu"], ["L4.Cu", "L5.Cu"]],
    expectedFindings: [
      { id: "PCB_VIA_TO_VIA_CLEARANCE:future-a,future-b", ruleId: "PCB_VIA_TO_VIA_CLEARANCE", severity: "Error", objectIds: ["future-a", "future-b"] },
    ],
  },
  {
    name: "both missing diameters use drill times two",
    project: project([via("fallback-a", 20, 2), via("fallback-b", 24, 2)]),
    expectedFindings: [
      { id: "PCB_VIA_TO_VIA_CLEARANCE:fallback-a,fallback-b", ruleId: "PCB_VIA_TO_VIA_CLEARANCE", severity: "Error", objectIds: ["fallback-a", "fallback-b"] },
    ],
  },
  {
    name: "both explicit diameters are used",
    project: project([via("explicit-a", 20, 1, 4), via("explicit-b", 24, 1, 4)]),
    expectedFindings: [
      { id: "PCB_VIA_TO_VIA_CLEARANCE:explicit-a,explicit-b", ruleId: "PCB_VIA_TO_VIA_CLEARANCE", severity: "Error", objectIds: ["explicit-a", "explicit-b"] },
    ],
  },
  {
    name: "mixed explicit and fallback diameters are used independently",
    project: project([via("mixed-explicit", 20, 1, 6), via("mixed-fallback", 25.5, 2)]),
    expectedFindings: [
      { id: "PCB_VIA_TO_VIA_CLEARANCE:mixed-explicit,mixed-fallback", ruleId: "PCB_VIA_TO_VIA_CLEARANCE", severity: "Error", objectIds: ["mixed-explicit", "mixed-fallback"] },
    ],
  },
  {
    name: "exact clearance equality passes under the current comparator",
    project: project([via("boundary-a", 20, 1, 2), via("boundary-b", 23, 1, 2)]),
    expectedFindings: [],
  },
  {
    name: "definite clearance violation is an Error",
    project: project([via("violation-a", 20, 1, 2), via("violation-b", 22, 1, 2)]),
    expectedFindings: [
      { id: "PCB_VIA_TO_VIA_CLEARANCE:violation-a,violation-b", ruleId: "PCB_VIA_TO_VIA_CLEARANCE", severity: "Error", objectIds: ["violation-a", "violation-b"] },
    ],
  },
  {
    name: "definite clearance pass emits no finding",
    project: project([via("pass-a", 20, 1, 2), via("pass-b", 24, 1, 2)]),
    expectedFindings: [],
  },
  {
    name: "reversing Via array order reverses pair object order and finding identity",
    project: project([via("reverse-b", 24.5, 1, 4), via("reverse-a", 20, 1, 4)]),
    expectedFindings: [
      { id: "PCB_VIA_TO_VIA_CLEARANCE:reverse-b,reverse-a", ruleId: "PCB_VIA_TO_VIA_CLEARANCE", severity: "Error", objectIds: ["reverse-b", "reverse-a"] },
    ],
  },
  {
    name: "three Vias emit multiple independent pairs in nested input order",
    project: project([via("multi-a", 20, 1, 2), via("multi-b", 22, 1, 2), via("multi-c", 24, 1, 2)]),
    expectedFindings: [
      { id: "PCB_VIA_TO_VIA_CLEARANCE:multi-a,multi-b", ruleId: "PCB_VIA_TO_VIA_CLEARANCE", severity: "Error", objectIds: ["multi-a", "multi-b"] },
      { id: "PCB_VIA_TO_VIA_CLEARANCE:multi-b,multi-c", ruleId: "PCB_VIA_TO_VIA_CLEARANCE", severity: "Error", objectIds: ["multi-b", "multi-c"] },
    ],
  },
  {
    name: "one floating-point step inside the boundary is indeterminate under the current comparator",
    project: project([via("ulp-a", 10, 1, 2), via("ulp-b", 13 - Number.EPSILON * 8, 1, 2)]),
    expectedBoundaryState: "INDETERMINATE_WITHIN_EXISTING_UNCERTAINTY",
    expectedFindings: [
      { id: "PCB_GEOMETRY_INDETERMINATE:ulp-a,ulp-b", ruleId: "PCB_GEOMETRY_INDETERMINATE", severity: "Error", objectIds: ["ulp-a", "ulp-b"] },
    ],
  },
];

export const v2MigrationGoldens = [
  {
    name: "schema-v1 input with absent optional arrays migrates to v2",
    input: { schemaVersion: 1, projectName: "legacy-v1", components: [], grid: 10 },
    expected: {
      schemaVersion: 2,
      projectName: "legacy-v1",
      components: [],
      grid: 10,
      wires: [],
      tracks: [],
      vias: [],
    },
  },
  {
    name: "explicit schema-v2 input retains supplied v2 data",
    input: {
      schemaVersion: 2,
      projectName: "explicit-v2",
      components: [],
      wires: [],
      tracks: [],
      vias: [via("explicit-v2-via", 30, 1)],
      grid: 12,
      designRules: { minimumViaClearance: 1.25 },
    },
    expected: {
      schemaVersion: 2,
      projectName: "explicit-v2",
      components: [],
      wires: [],
      tracks: [],
      vias: [via("explicit-v2-via", 30, 1)],
      grid: 12,
      designRules: { minimumViaClearance: 1.25 },
    },
  },
  {
    name: "missing schemaVersion is treated as legacy v1 input",
    input: { projectName: "versionless-legacy", components: [] },
    expected: {
      schemaVersion: 2,
      projectName: "versionless-legacy",
      components: [],
      grid: 20,
      wires: [],
      tracks: [],
      vias: [],
    },
  },
] as const;
