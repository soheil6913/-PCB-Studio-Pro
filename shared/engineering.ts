export type Point = { x: number; y: number };
export type Severity = "Error" | "Warning" | "Info";
export type EngineeringComponent = {
  id: string;
  ref: string;
  value?: string;
  footprint?: string;
  x: number;
  y: number;
  rotation?: number;
  layer?: "F.Cu" | "B.Cu";
};
export type EngineeringWire = { id: string; from: Point; to: Point; net?: string };
export type EngineeringTrack = { id: string; from: Point; to: Point; width: number; layer: "F.Cu" | "B.Cu" };
export type EngineeringVia = { id: string; x: number; y: number; drill: number; diameter?: number };
export type EngineeringProject = {
  components: EngineeringComponent[];
  wires: EngineeringWire[];
  tracks: EngineeringTrack[];
  vias: EngineeringVia[];
  grid?: number;
  board?: { x: number; y: number; width: number; height: number; edgeClearance: number };
};
export type Measurement = { start: Point; end: Point; distance: number; gridUnits: number };
export type DrcResult = {
  id: string;
  ruleId: string;
  severity: Severity;
  objectIds: string[];
  coordinates?: Point[];
  explanation: string;
  correction: string;
};

const DEFAULT_BOARD = { x: 150, y: 112, width: 660, height: 328, edgeClearance: 10 };
const EPSILON = 0.001;

export function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function measure(start: Point, end: Point, grid = 20): Measurement {
  const px = distance(start, end);
  return { start, end, distance: px, gridUnits: grid > 0 ? px / grid : px };
}

export function snapToGrid(point: Point, grid: number) {
  if (grid <= 0) return point;
  return { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid };
}

export function route45(start: Point, end: Point): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < EPSILON || Math.abs(dy) < EPSILON || Math.abs(Math.abs(dx) - Math.abs(dy)) < EPSILON) return [start, end];
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
  const mid = { x: start.x + Math.sign(dx) * diagonal, y: start.y };
  return [start, mid, end];
}

function pointToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
}

function segmentsDistance(a: EngineeringTrack, b: EngineeringTrack) {
  return Math.min(pointToSegment(a.from, b.from, b.to), pointToSegment(a.to, b.from, b.to), pointToSegment(b.from, a.from, a.to), pointToSegment(b.to, a.from, a.to));
}

function insideBoard(point: Point, board: typeof DEFAULT_BOARD, margin = 0) {
  return point.x >= board.x + margin && point.x <= board.x + board.width - margin && point.y >= board.y + margin && point.y <= board.y + board.height - margin;
}

function result(ruleId: string, severity: Severity, objectIds: string[], explanation: string, correction: string, coordinates?: Point[]): DrcResult {
  return { id: `${ruleId}:${objectIds.join(",")}`, ruleId, severity, objectIds, explanation, correction, coordinates };
}

export function validateSchematic(project: Pick<EngineeringProject, "components" | "wires">): DrcResult[] {
  const findings: DrcResult[] = [];
  const refs = new Map<string, EngineeringComponent[]>();
  project.components.forEach(component => refs.set(component.ref, [...(refs.get(component.ref) ?? []), component]));
  refs.forEach((items, ref) => { if (items.length > 1) findings.push(result("SCH_DUPLICATE_REFERENCE", "Error", items.map(item => item.id), `Reference ${ref} is used more than once.`, "Assign a unique reference designator to each component.", items.map(item => ({ x: item.x, y: item.y })))); });
  project.components.forEach(component => {
    if (!component.value?.trim()) findings.push(result("SCH_MISSING_VALUE", "Warning", [component.id], `${component.ref} has no value.`, "Set a meaningful value before generating a BOM.", [{ x: component.x, y: component.y }]));
    if (!component.footprint?.trim() || component.footprint === "Not assigned") findings.push(result("SCH_MISSING_FOOTPRINT", "Error", [component.id], `${component.ref} has no assigned footprint.`, "Assign a verified footprint before manufacturing.", [{ x: component.x, y: component.y }]));
    const connected = project.wires.some(wire => distance({ x: component.x, y: component.y }, wire.from) < 48 || distance({ x: component.x, y: component.y }, wire.to) < 48);
    if (!connected) findings.push(result("SCH_UNCONNECTED_COMPONENT", "Error", [component.id], `${component.ref} is not connected to a wire endpoint.`, "Connect the component pins to a named net.", [{ x: component.x, y: component.y }]));
  });
  const netGroups = new Map<string, EngineeringWire[]>();
  project.wires.forEach(wire => { const net = wire.net || `__wire_${wire.id}`; netGroups.set(net, [...(netGroups.get(net) ?? []), wire]); });
  netGroups.forEach((wires, net) => { const endpoints = wires.flatMap(wire => [wire.from, wire.to]); const visited = new Set<number>(); const stack = [0]; while (stack.length) { const index = stack.pop()!; if (visited.has(index)) continue; visited.add(index); endpoints.forEach((point, pointIndex) => { if (!visited.has(pointIndex) && distance(endpoints[index], point) <= 1) stack.push(pointIndex); }); } if (visited.size !== endpoints.length) findings.push(result("SCH_DISCONNECTED_NET", "Error", wires.map(wire => wire.id), `Net ${net} contains disconnected wire segments.`, "Join the segments or correct the net label.", endpoints)); });
  return findings;
}

export function validatePcb(project: Pick<EngineeringProject, "components" | "tracks" | "vias"> & Partial<Pick<EngineeringProject, "wires" | "board">>): DrcResult[] {
  const board = project.board ?? DEFAULT_BOARD;
  const findings: DrcResult[] = [];
  project.components.forEach(component => {
    if (!insideBoard({ x: component.x, y: component.y }, board)) findings.push(result("PCB_COMPONENT_OUTSIDE_BOARD", "Error", [component.id], `${component.ref} is outside the board boundary.`, "Move the component inside the board outline.", [{ x: component.x, y: component.y }]));
    if (!component.footprint?.trim() || component.footprint === "Not assigned") findings.push(result("PCB_INVALID_FOOTPRINT", "Error", [component.id], `${component.ref} does not have a verified footprint.`, "Assign a verified footprint before export.", [{ x: component.x, y: component.y }]));
  });
  project.tracks.forEach(track => {
    const endpoints = [track.from, track.to];
    endpoints.forEach(point => { if (!insideBoard(point, board, board.edgeClearance)) findings.push(result("PCB_EDGE_CLEARANCE", "Error", [track.id], "A track violates the configured copper-to-edge clearance.", "Move the route inward or adjust the verified board constraint.", endpoints)); });
    project.tracks.filter(other => other.id !== track.id && other.layer === track.layer && other.id > track.id).forEach(other => { const required = (track.width + other.width) / 2 + board.edgeClearance; const actual = segmentsDistance(track, other); if (actual < required) findings.push(result("PCB_TRACK_CLEARANCE", "Error", [track.id, other.id], `Tracks are ${actual.toFixed(2)} units apart; ${required.toFixed(2)} is required.`, "Reroute one segment or increase spacing.", [track.from, track.to, other.from, other.to])); });
    project.components.forEach(component => { const actual = pointToSegment({ x: component.x, y: component.y }, track.from, track.to); const required = track.width / 2 + board.edgeClearance / 2; if (actual < required) findings.push(result("PCB_TRACK_TO_PAD_CLEARANCE", "Warning", [track.id, component.id], `${track.id} passes too close to ${component.ref}.`, "Reroute around the component pad area.", [{ x: component.x, y: component.y }])); });
  });
  project.vias.forEach(via => { if (!insideBoard({ x: via.x, y: via.y }, board, board.edgeClearance)) findings.push(result("PCB_VIA_EDGE_CLEARANCE", "Error", [via.id], "A via violates the configured board-edge clearance.", "Move the via inward.", [{ x: via.x, y: via.y }])); project.tracks.forEach(track => { if (pointToSegment({ x: via.x, y: via.y }, track.from, track.to) < (via.diameter ?? via.drill * 2) / 2 + board.edgeClearance / 2) findings.push(result("PCB_TRACK_TO_VIA_CLEARANCE", "Warning", [track.id, via.id], `${track.id} passes too close to ${via.id}.`, "Reroute the track or move the via.", [{ x: via.x, y: via.y }])); }); });
  for (let i = 0; i < project.components.length; i += 1) for (let j = i + 1; j < project.components.length; j += 1) { const a = project.components[i]; const b = project.components[j]; if (distance({ x: a.x, y: a.y }, { x: b.x, y: b.y }) < 48) findings.push(result("PCB_COMPONENT_CLEARANCE", "Warning", [a.id, b.id], `${a.ref} and ${b.ref} overlap the minimum component clearance.`, "Move one component away from the other.", [{ x: a.x, y: a.y }, { x: b.x, y: b.y }])); }
  return findings;
}

export function runDesignRules(project: EngineeringProject): DrcResult[] {
  return [...validateSchematic(project), ...validatePcb(project)];
}

export function validateProjectJson(value: unknown): value is EngineeringProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<EngineeringProject>;
  return Array.isArray(project.components) && Array.isArray(project.wires) && Array.isArray(project.tracks) && Array.isArray(project.vias) && project.components.every(component => typeof component.id === "string" && typeof component.ref === "string" && typeof component.x === "number" && typeof component.y === "number");
}
