# Phase 5 — PCB Pad-to-Board-Edge DRC Audit

## Scope and baseline

- Repository: `soheil6913/-PCB-Studio-Pro`
- Working branch: `fix/phase5-pad-edge-clearance-20261119`
- Phase 4.1.1 baseline: `10e4fe5e05d220d78f06a4baf48b4b1659a5248a`
- Phase 5 code and test SHA: `d82d7dfd18e135beb9bacc3339a818715422ca1f`
- Main remains a separate line of development.

This phase addresses one confirmed DRC omission found by direct source inspection. It does not redesign the UI or change unrelated project workflows.

## Finding

**BUG-5.1 — Pad copper was not checked against board-edge clearance**

Before this correction, `validatePcb` checked the complete track geometry against the board boundary and checked via outer diameter against the board boundary. It did not check footprint pad copper at all. A pad could therefore violate the configured copper-to-edge clearance without producing a DRC finding.

Severity: **High** — false-negative board-edge DRC.

## Correction

Added pad-to-board containment checking to `validatePcb`:

- Uses `designRules.copperToEdgeClearance` when configured.
- Otherwise uses `board.edgeClearance`.
- Falls back to zero only when neither is configured, matching existing track/via behavior.
- Rectangular pads are checked using their four transformed corners, including pad rotation and the already-composed component/pad transform.
- Circular and oval pads are checked using their rotated analytical axis-aligned support extents.
- Violations emit `PCB_PAD_EDGE_CLEARANCE` with severity `Error`, and identify both component ID and pad ID.

The check evaluates the copper shape itself, not the footprint courtyard or component body.

## Regression coverage

Added ordinary passing regression cases for:

1. Rectangular pad outside the required copper-to-edge margin.
2. Rotated rectangular pad with safe transformed bounds.
3. Rotated oval pad violating the margin.
4. Circular pad violating the margin.
5. Pad exactly at the allowed rectangular boundary.
6. Explicit `copperToEdgeClearance` overriding the board default.

The tests assert both positive findings and safe cases. No skipped tests, expected failures, relaxed assertions, or mocked geometry results were introduced.

## CI verification

GitHub Actions run: [44498217774](https://github.com/soheil6913/-PCB-Studio-Pro/actions/runs/44498217774)

Verified run head SHA: `d82d7dfd18e135beb9bacc3339a818715422ca1f`

| Check | Result |
|---|---|
| `pnpm check` | Passed |
| `pnpm test` | 5 files passed; 44 tests passed |
| `pnpm build` | Passed |

The CI run completed successfully for the exact code/test SHA above.

## Files changed

- `shared/engineering.ts` — pad-to-board-edge geometry and DRC finding.
- `shared/engineering.test.ts` — regression tests for pad shape, rotation, and rule override.
- `PHASE_5_PAD_EDGE_DRC_REPORT.md` — this report.

## Limitations

- The current board model is an axis-aligned rectangular board. Polygonal or curved board outlines are not represented by this DRC implementation.
- This check covers copper pads, not footprint courtyards, component-body collision, solder-mask expansion, or manufacturing-specific edge constraints.
- This is a local deterministic DRC correction, not IPC compliance, fabrication approval, or manufacturing sign-off.

## Repository safety

- Phase 5 is isolated on its own `fix/**` branch.
- `main` was not modified.
- PR #1 was not modified or merged.
- Phase 3, Phase 4, Phase 4.1, and Phase 4.1.1 branches were not modified.
- No new pull request was opened.

## Classification

**FIXED WITH LIMITATIONS** — the missing pad copper-to-board-edge check is implemented and the exact code/test SHA passes TypeScript, all automated tests, and production build. The limitation is the existing rectangular-board model and the broader unimplemented manufacturing checks listed above.
