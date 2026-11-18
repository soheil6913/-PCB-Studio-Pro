# PCB Studio Pro — implementation plan

## Scope and approach

PCB Studio Pro is being implemented as a modular engineering workspace, not a static dashboard. The first working slice prioritizes a bilingual Persian-first shell, editable schematic and PCB geometry, component library search, deterministic local persistence, JSON project interchange, BOM CSV output, and an inspectable DRC surface. The architecture keeps geometry, connectivity, validation, localization, and interchange concerns separated so standards-backed KiCad/Gerber/Excellon/DXF/3D adapters can be added without rewriting the UI.

The first slice deliberately does not claim standards compatibility for formats whose parsers/exporters are not yet implemented. Unsupported manufacturing and 3D features are shown as planned modules or validation-gated capabilities rather than simulated success.

## Project structure

- `client/src/pages/Home.tsx`: main engineering workspace, localized UI, schematic/PCB/3D modes, library, properties, DRC, project file actions.
- `client/src/index.css`: dark engineering visual system, RTL-safe layout primitives, canvas and panel styling.
- `server/routers.ts`: future persistence and AI service boundary; current workspace persistence is local JSON-first so the MVP remains usable without account state.
- `drizzle/schema.ts` and `server/db.ts`: database foundation for durable project records and version history in the next increment.
- `public/manus-routes.json`: route manifest for the single-page workspace.
- `plan.md` / `TODO.md`: product scope, design decisions, and acceptance outcomes.

## Design direction

Three low-probability style directions were considered:

1. **Graphite Instrument Panel** (probability 0.06): industrial dark UI with dense instrumentation and luminous signal traces.
2. **Paper Blueprint** (probability 0.03): pale technical drafting surface with blueprint annotations.
3. **Neon Lab Console** (probability 0.04): high-saturation cyberpunk controls with strong glow effects.

Chosen direction: **Graphite Instrument Panel**.

- **Design movement:** modern EDA workstation inspired by lab instruments, KiCad, and avionics consoles.
- **Core principles:** geometry first, high information density without visual noise, every action leaves a visible state change, and engineering confidence is separate from visual polish.
- **Color philosophy:** graphite and near-black establish a stable workbench; cyan/turquoise identifies active geometry and safe interaction; gold marks project identity and selected engineering decisions; red/amber are reserved for validation findings.
- **Layout paradigm:** an asymmetric tool rail, searchable component dock, central infinite-style canvas, and contextual property/validation rail rather than a centered dashboard grid.
- **Signature elements:** cyan coordinate crosshair, gold project-status strip, and monospaced engineering metadata paired with Persian/English labels.
- **Interaction philosophy:** tools are explicit and mode-based; the canvas is direct-manipulation; unsupported operations are disclosed at the moment of action.
- **Animation:** restrained 120–180ms transitions, no decorative looping motion; validation states pulse once when changed and selected geometry gets a crisp cyan edge.
- **Typography system:** system UI sans with Persian fallback for readable labels; IBM Plex Mono / ui-monospace for references, coordinates, units, and file names.
- **Brand essence:** a bilingual engineering bench for turning circuits into manufacturable boards; precise, candid, extensible.
- **Brand voice:** concise, technical, and honest. Example lines: “Select a net to inspect its continuity.” and “Export is available only when the file format has passed validation.”
- **Wordmark & logo:** a compact PCB trace forming a square “P” beside the PCB STUDIO PRO wordmark.
- **Signature brand color:** `#26d9c4` turquoise signal trace.

## Delivery sequence

1. Establish UI shell, localization, project state, and file actions.
2. Add functional schematic geometry interactions and component property editing.
3. Add PCB board geometry interactions, layers, tracks, vias, and deterministic DRC findings.
4. Add database-backed project/version records and server APIs.
5. Add standards-backed interchange adapters one format at a time, with fixtures and validation.
6. Add real 3D renderer and verified component-model library.
7. Add AI engineering assistant behind explicit validation and service configuration.

## Runtime

Use the initialized React/Express/tRPC/Drizzle project with the managed port 3000. Run `pnpm dev` for the server-backed preview. The current first slice stores the active project in browser local storage and supports real file download/upload so project data is not trapped in the UI. The database schema remains the correct home for multi-device persistence and version history in the next increment.
