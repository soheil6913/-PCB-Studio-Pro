# PCB Studio Pro — delivery outcomes

## Outcome: bilingual engineering workspace
- Support Persian (فارسی) as the default language with full RTL interface behavior.
- Support English with full LTR interface behavior.
- Provide a language switcher in the main interface.
- Preserve technical symbols, component names, formulas, and engineering units.
- Translate visible menus, tools, settings, status labels, and validation copy included in the delivered slice.

## Outcome: professional PCB workstation shell
- Provide a dark professional workspace with black/graphite backgrounds, turquoise/cyan highlights, gold project accents, toolbars, contextual panels, bottom status bar, zoom/pan/selection/measurement affordances, component library, layers/properties, DRC, and 2D/3D work modes.
- Prioritize reliable engineering functionality over decorative features.

## Outcome: functional schematic editing slice
- Provide component placement for common passive, diode, LED, transistor, connector, MCU, and sensor categories represented in the library.
- Provide direct manipulation of placed components, reference/value/footprint properties, wire drawing, net labels, junction indicators, and measurement mode.
- Preserve project data while editing and support undo/redo state affordances in the workspace.

## Outcome: functional PCB editing slice
- Provide board outline visualization, component placement and rotation controls, copper track routing, via placement, multiple copper-layer selection, grid and snapping, and interactive selection/editing.
- Provide visible layer and properties controls.
- Clearly distinguish editable geometry from future standards-backed manufacturing output.

## Outcome: component library
- Provide search and category filtering for common passives, diodes, LEDs, transistors, MCUs, sensors, connectors, and modules.
- Do not fabricate unavailable technical specifications or footprints; show library metadata only where explicitly available in the sample library.

## Outcome: deterministic validation surface
- Implement a deterministic local workspace scan that reports unconnected nets, missing footprints, clearance/edge warnings, and placement conflicts when the editable project state meets those conditions.
- Display precise issue category, severity, location/reference, and actionable suggestion.
- Clearly distinguish workspace checks from a manufacturing sign-off or verified simulation.

## Outcome: real project file operations
- Provide local project persistence between sessions.
- Provide validated JSON project export and import.
- Provide BOM CSV export from the current component list.
- Provide clear failure handling for malformed imports.
- Do not claim KiCad, Gerber, Excellon, DXF, PDF, or verified 3D-model compatibility until standards-backed adapters are implemented.

## Outcome: architecture and documentation
- Keep UI, geometry state, localization, DRC, library data, and interchange boundaries modular and maintainable.
- Provide a Persian/English implementation plan and an explicit build/deployment path in the project documentation.
- Include a sample project for testing the editing and validation slice.
