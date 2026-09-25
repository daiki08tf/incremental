# GENERICIZATION_EVIDENCE.md — dev-infra across 3 repos

Evidence for a possible shared dev-infra engine, recorded after the third
adoption. **Nothing here is implemented.** This document exists so a future
session can decide with data instead of vibes.

Compared:

| repo | runtime | module system | dep-graph basis | save-check basis |
|---|---|---|---|---|
| fishing | tsx + node_modules | TypeScript | `import` specifiers (`./x`, `@/x`, extless) | game-specific |
| gameproject (Blade Vale) | plain node, zero-dep | ESM `.mjs` | `import './x.js'` (explicit ext) | vm-free: real `migrateC1JobSaveBack` fixtures |
| incremental | plain node, zero-dep | browser globals, no imports | `Game.X` define/reference symbols | vm harness: codec roundtrip + offline caps |

## 1. Identical across all three (COMMON CORE)

- `./dev` bash shim → `node scripts/dev/cli.<ext> "$@"`, `cd` to repo root.
- `.dev/systems.json` + `.dev/authority-map.json` + generated
  `.dev/project-map.json` — same roles in all three.
- Bucketing: ordered path-prefix rules, `dir/` = directory, `*.ext` =
  suffix, else prefix; first match wins; `unmapped` fallback.
- Authority-map shape: id/title/authority paths, persisted/mutation/
  validation/notes fields; `--check` verifies all paths exist.
- project-map: deterministic generation, `meta.git` excluded from the
  freshness comparison, `map --write`/`--check` pair, committed artifact.
- Command skeleton: doctor/status/map/authority/impact/scope/context/
  handoff/smoke/check (+help), identical CLI arg handling and exit codes
  (0 pass / 1 fail), PASS/WARN/FAIL vocabulary.
- Observer-only discipline: no command mutates product files except
  `map --write` touching its own generated artifact.
- Self-tests live inside the repo's own test file convention and run in CI/
  the official test path.

## 2. Config-only differences

- `systems.json` entries — per-repo boundaries (Fishing feature dirs vs
  Blade Vale `js/data|patches|screens` families vs Incremental per-file).
- `authority-map.json` entries — entirely repo-authored.
- `docs` hints per system.
- Usage text wording.

## 3. Thin-adapter differences (same need, different mechanism)

- **Dependency graph**: Fishing = TS import specifiers w/ alias+extless
  resolution; Blade Vale = explicit `.js` imports; Incremental = no
  imports at all — a `Game.X` define/reference symbol graph, plus the rule
  that `Game.state = <computed>` is a *use* not a *definition*.
- **Test association**: Fishing/Blade Vale = tests importing system files;
  Incremental = tests *naming* module files (`'state'` in SCRIPT_ORDER,
  `src/x.js` strings) since the suite uses a vm loader, not imports.
- **classifyFile categories**: per-repo buckets (save/tests/docs/generated/
  shell…).
- **Smoke content**: Fishing = ?; Blade Vale = ESM imports + schema +
  migration roundtrip + curated subset; Incremental = vm-harness module
  load + tick + codec roundtrip + goal sanity.
- **check orchestration**: same "run N commands, collect failures, print
  last-25-lines" shape; step lists differ; Blade Vale has a --quick/
  full split (suite is ~9s), Incremental doesn't need one (~80ms).
- **doctor sections**: shared skeleton (env/required paths/configs/map
  freshness/git advisory) + per-repo extras (CI file check, script-order
  consistency, artifact presence).

## 4. Game-specific (not extractable)

- Authority-map entries and their invariants.
- `save-check` internals — each exercises that game's real persistence
  code (C1 job migration vs save-code codec+offline). The *command* is
  common; the *checks* cannot be shared.
- Incremental `script-order` consistency check, `artifact/game.html`
  generated-file handling, vm `gameLoad` harness, DOM-stub tests.
- Blade Vale save-surface marker scan, concept aliasing depth.

## 5. Benefits if a shared engine existed

- One fix propagates: the `Game.state = x` definition-vs-use bug found in
  Incremental's graph this session would be fixed for all adopters at once.
- New-repo onboarding shrinks to writing two config files + one adapter.
- Command UX stays uniform; docs/tests patterns copy cleanly.

## 6. Costs / risks

- **Distribution**: an npm package reintroduces the install step both
  zero-dep repos deliberately avoid; a vendored copy reintroduces drift
  (the exact problem a package is meant to solve).
- **Module-system spread**: CJS vs ESM vs tsx means either three builds,
  or a lowest-common-denominator CJS core imported awkwardly by ESM repos.
- **Config-hook complexity**: dep-graph, test association, smoke, and
  save-check all need per-repo adapters — the "shared" layer shrinks to
  bucketing + freshness + output formatting, which is the least buggy
  third already.
- **Blast radius**: a shared-engine bug breaks three repos; today each
  repo can evolve or freeze independently.
- Three repos is still small-N; two of three were adapted this week and
  already diverged in necessary ways.

## 7. Extraction candidates (ranked, if ever)

1. **Map core** — `matchesPrefix`/`bucketFor`/canonicalJson/`mapIsFresh`/
   serialize. Small, pure, identical modulo the dep-graph hook. Best
   extraction value.
2. **CLI dispatcher + help table** — trivially shared but also trivially
   duplicated; low value.
3. **Doctor skeleton** — sectioned PASS/WARN/FAIL runner; ~60% shared.
4. **Dep-graph** — interface only (`depends(file) → files`); each repo
   keeps its own scanner. An interface without implementation is not a
   package.
5. **save-check/smoke** — per-game, do not extract.

## 8. Recommendation for later

Do **not** extract now. If a 4th repo adopts the pattern, prefer a
*single vendored file* (`scripts/dev/mapCore.js`, copied per repo)
covering bucketing + freshness + serialization over an npm package —
it preserves zero-dependency installs and makes drift visible in `git
diff` instead of hiding it in a lockfile. Re-derive this decision only
when the adapters in §3 have actually stabilized across 3+ repos.

## Explicitly NOT built (backlog evidence)

- shared `@personal/devinfra` package / monorepo
- central schema registry for `.dev/*.json`
- cross-repo dashboard or global dev CLI
- web UI / MCP server over project maps
- Knowledge Compiler / AI Dev OS integration
