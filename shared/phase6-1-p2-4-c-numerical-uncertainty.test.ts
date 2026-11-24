import { describe, expect, it } from "vitest";
import {
  distance,
  gjkWithinDistance,
  padToPadDistanceDetailed,
  segmentsIntersect,
  validatePcb,
  validateSchematic,
  type Pad,
} from "./engineering";

function pad(id: string, x: number, y: number, extra: Record<string, unknown> = {}): Pad {
  return { id, number: "1", position: { x, y }, width: 4, height: 4, shape: "circle", layer: "F.Cu", ...extra } as Pad;
}

function schematic(wires: unknown[], components: unknown[] = [], junctions?: unknown[]) {
  return { wires, components, junctions } as never;
}

describe("Phase 6.1 P2.4-C numerical uncertainty", () => {
  it("keeps large common-offset deltas finite when the represented delta is finite", () => {
    const base = 1e200;
    const delta = 1e185;
    const representedDelta = (base + delta) - base;
    expect(distance({ x: base, y: base }, { x: base + delta, y: base })).toBe(representedDelta);
  });

  it("does not turn an unrepresentable opposite-sign distance into a finite value", () => {
    const value = distance({ x: -Number.MAX_VALUE, y: 0 }, { x: Number.MAX_VALUE, y: 0 });
    expect(Number.isNaN(value)).toBe(true);
  });

  it("classifies finite pads with non-finite derived GJK arithmetic as indeterminate", () => {
    const decision = gjkWithinDistance(pad("a", -Number.MAX_VALUE, 0), pad("b", Number.MAX_VALUE, 0), 0);
    expect(decision.state).toBe("INDETERMINATE");
    expect(decision.reason).toMatch(/non-finite geometry scale|non-finite initial direction/);
    const detailed = padToPadDistanceDetailed(pad("a", -Number.MAX_VALUE, 0), pad("b", Number.MAX_VALUE, 0));
    expect(detailed.state).toBe("INDETERMINATE");
  });

  it("propagates uncertain endpoint/pin connectivity without a false unconnected conclusion", () => {
    const findings = validateSchematic(schematic([
      { id: "w1", from: { x: -Number.MAX_VALUE, y: 0 }, to: { x: Number.MAX_VALUE, y: 0 }, net: "N" },
    ], [{
      id: "c1", ref: "U1", x: 0, y: 0,
      pins: [{ id: "p1", number: "1", name: "P1", position: { x: 0, y: 0 }, required: true }],
    } ]));
    expect(findings.some(finding => finding.ruleId === "SCH_GEOMETRY_INDETERMINATE")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "SCH_UNCONNECTED_REQUIRED_PIN")).toBe(false);
    expect(findings.some(finding => finding.ruleId === "SCH_DISCONNECTED_NET")).toBe(false);
  });

  it("does not union or assert a crossing result when intersection arithmetic is unresolved", () => {
    const findings = validateSchematic(schematic([
      { id: "w1", from: { x: -Number.MAX_VALUE, y: -Number.MAX_VALUE }, to: { x: Number.MAX_VALUE, y: Number.MAX_VALUE }, net: "A" },
      { id: "w2", from: { x: -Number.MAX_VALUE, y: Number.MAX_VALUE }, to: { x: Number.MAX_VALUE, y: -Number.MAX_VALUE }, net: "B" },
    ]));
    expect(findings.some(finding => finding.ruleId === "SCH_GEOMETRY_INDETERMINATE")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "SCH_NET_NAME_CONFLICT")).toBe(false);
    expect(findings.some(finding => finding.ruleId === "SCH_CROSSING_WITHOUT_JUNCTION")).toBe(false);
  });

  it("retains fail-safe DRC behavior for finite extremes with non-finite derived clearance", () => {
    const findings = validatePcb({
      components: [],
      tracks: [
        { id: "t1", from: { x: -Number.MAX_VALUE, y: 0 }, to: { x: Number.MAX_VALUE, y: 0 }, width: 1, layer: "F.Cu" },
        { id: "t2", from: { x: 0, y: -1 }, to: { x: 0, y: 1 }, width: 1, layer: "F.Cu" },
      ],
      vias: [],
      board: { x: -Number.MAX_VALUE, y: -Number.MAX_VALUE, width: Number.MAX_VALUE, height: Number.MAX_VALUE, edgeClearance: 0 },
      designRules: { minimumTrackClearance: 1 },
    });
    expect(findings.some(finding => finding.ruleId === "PCB_GEOMETRY_INDETERMINATE" || finding.ruleId === "PCB_TRACK_CLEARANCE")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "PCB_TRACK_CLEARANCE" && finding.severity === "Info")).toBe(false);
  });

  it("matches an independent integer oracle for signed near-collinear orientations", () => {
    const orientation = (a: [number, number], b: [number, number], c: [number, number]) =>
      BigInt(b[0] - a[0]) * BigInt(c[1] - a[1]) - BigInt(b[1] - a[1]) * BigInt(c[0] - a[0]);
    const cases: Array<[[number, number], [number, number], [number, number], [number, number]]> = [
      [[0, 0], [2000000000, 2000000002], [1000000000, 1000000001], [1000000000, 1000000003]],
      [[0, 0], [2000000000, 2000000002], [1000000000, 1000000003], [1000000000, 1000000001]],
      [[0, 0], [2000000000, 2000000002], [1000000000, 1000000002], [1000000000, 1000000003]],
    ];
    for (const [a, b, c, d] of cases) {
      const ab = orientation(a, b, c); const ab2 = orientation(a, b, d);
      const cd = orientation(c, d, a); const cd2 = orientation(c, d, b);
      const expected = (ab === 0n || ab2 === 0n || cd === 0n || cd2 === 0n)
        ? true
        : (ab > 0n) !== (ab2 > 0n) && (cd > 0n) !== (cd2 > 0n);
      expect(segmentsIntersect({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, { x: c[0], y: c[1] }, { x: d[0], y: d[1] })).toBe(expected);
    }
  });

  it("preserves exact collinear overlap and non-overlap without a guessed determinant zero", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 11, y: 0 }, { x: 15, y: 0 })).toBe(false);
  });

  it("keeps endpoint touch within tolerance connected and separation beyond tolerance disconnected", () => {
    const within = validateSchematic(schematic([
      { id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, net: "N" },
      { id: "b", from: { x: 10 + 0.5e-7, y: 0 }, to: { x: 20, y: 0 }, net: "N" },
    ]));
    const beyond = validateSchematic(schematic([
      { id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, net: "N" },
      { id: "b", from: { x: 10 + 2e-7, y: 0 }, to: { x: 20, y: 0 }, net: "N" },
    ]));
    expect(within.some(finding => finding.ruleId === "SCH_DISCONNECTED_NET")).toBe(false);
    expect(beyond.some(finding => finding.ruleId === "SCH_DISCONNECTED_NET")).toBe(true);
  });

  it("treats an overflowed node distance as conclusively outside the connectivity threshold", () => {
    const findings = validateSchematic(schematic([
      { id: "a", from: { x: -Number.MAX_VALUE, y: 0 }, to: { x: -Number.MAX_VALUE / 2, y: 0 }, net: "A" },
      { id: "b", from: { x: Number.MAX_VALUE / 2, y: 0 }, to: { x: Number.MAX_VALUE, y: 0 }, net: "B" },
    ]));
    expect(findings.some(finding => finding.ruleId === "SCH_GEOMETRY_INDETERMINATE")).toBe(false);
  });

  it("keeps an unrelated required-pin conclusion when another wire pair is indeterminate", () => {
    const findings = validateSchematic(schematic([
      { id: "x1", from: { x: -Number.MAX_VALUE, y: -Number.MAX_VALUE }, to: { x: Number.MAX_VALUE, y: Number.MAX_VALUE }, net: "A" },
      { id: "x2", from: { x: -Number.MAX_VALUE, y: Number.MAX_VALUE }, to: { x: Number.MAX_VALUE, y: -Number.MAX_VALUE }, net: "A" },
    ], [{ id: "c1", ref: "U1", x: 100, y: 100, pins: [{ id: "p1", number: "1", name: "P1", position: { x: 0, y: 0 }, required: true }] }]));
    expect(findings.some(finding => finding.ruleId === "SCH_GEOMETRY_INDETERMINATE")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "SCH_UNCONNECTED_REQUIRED_PIN" && finding.objectIds.includes("c1:p1"))).toBe(true);
  });

  it("keeps an unrelated disconnected net conclusion when another net is indeterminate", () => {
    const findings = validateSchematic(schematic([
      { id: "x1", from: { x: -Number.MAX_VALUE, y: -Number.MAX_VALUE }, to: { x: Number.MAX_VALUE, y: Number.MAX_VALUE }, net: "A" },
      { id: "x2", from: { x: -Number.MAX_VALUE, y: Number.MAX_VALUE }, to: { x: Number.MAX_VALUE, y: -Number.MAX_VALUE }, net: "A" },
      { id: "b1", from: { x: 0, y: 100 }, to: { x: 1, y: 100 }, net: "B" },
      { id: "b2", from: { x: 10, y: 100 }, to: { x: 11, y: 100 }, net: "B" },
    ]));
    expect(findings.some(finding => finding.ruleId === "SCH_GEOMETRY_INDETERMINATE")).toBe(true);
    expect(findings.some(finding => finding.ruleId === "SCH_DISCONNECTED_NET" && finding.explanation.includes("Net B"))).toBe(true);
  });
});
