# Isolated branch test report

Branch: `fix/connectivity-drc-json-20261118`

Baseline commit: `de7497a675af7c6212bbc4751fce098c1f414e8d`

The baseline was executed before source changes. `pnpm check` passed. `pnpm test` passed with 3 test files and 17 tests. `pnpm build` passed; Vite emitted the existing warning that `/api/platform/config.js` lacks a `type="module"` attribute, but the build completed.

After the engineering corrections, the new regression suite includes graph connectivity chains, direct and rotated pin connections, junction and non-junction crossings, same-name disconnected nets, conflicting net names, cross-component pad clearance, shape/layer-aware pad checks, through-hole pad layer behavior, unknown JSON versions, null/nested malformed fields, safe migration, and safe DRC failure on malformed runtime data. The post-fix run passed with 3 test files and 22 tests. `pnpm check` passed. `pnpm build` passed; the same existing Vite warning was emitted, but the build completed.

Build success is not treated as evidence of electrical correctness. Electrical and DRC confidence in this branch is based on deterministic geometry/connectivity regression tests and explicit limitation findings, not on bundle compilation alone.
