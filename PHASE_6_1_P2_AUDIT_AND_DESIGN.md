
## 9. P2 implementation and verification evidence

### Implemented changes

- `shared/engineering.ts`: `migrateProjectJson` now uses own-property checks. Absent `components`, `wires`, `tracks`, `vias`, and `grid` retain documented defaults; explicit `null`, `undefined`, wrong types, and invalid values remain visible to `validateProjectJsonDetailed` and fail closed.
- `shared/engineering.ts`: `validateSchematic` now validates JSON-shaped runtime input through the existing detailed validator before iterating nested fields. Malformed direct calls return one stable `SCH_INVALID_INPUT` finding and do not throw. `runDesignRules` still returns only its existing `PROJECT_INVALID` path for malformed full projects.
- `shared/engineering.p2.test.ts`: focused regression coverage for absent-versus-explicit-null migration fields, invalid grid values, malformed direct schematic inputs, stable finding identity, and aggregate no-duplicate behavior.
- Circle equality was intentionally not enforced because the source-grounded application contract remains ambiguous; this is an explicit unresolved limitation, not a claimed fix.

### Actual verification results

| Check | Result |
|---|---|
| Focused P2 tests | 3 tests passed |
| Full `pnpm test` | 13 test files passed, 168 tests passed |
| `pnpm check` | Passed (`tsc --noEmit`) |
| `pnpm build` | Passed; Vite production bundle and server bundle completed |
| `git diff --check` | Passed |
| Lint | No lint script is configured in `package.json`; not run |

The production build emitted the existing Vite warning that `/api/platform/config.js` lacks a `type="module"` attribute; the build still completed successfully. No P1 compatibility test files were modified, and the P1 compatibility suite passed as part of the full test run.
