# DEV_INFRA.md — Incremental development infrastructure

`./dev` is the repo's machine-readable development front door. It answers
"where is the authority for X, what will editing it touch, and how do I
verify I didn't break the save or the artifact" without re-reading the GDD
and every file header.

It is **observer tooling, not product code**: it never starts the game,
never writes into `src/`, and its only generated artifact is
`.dev/project-map.json` (deterministic, committed, regenerated with
`./dev map --write`).

The dev-infra itself is **not an authority** — it only points at the real
ones (src files, GDD sections, the regression suite). If `./dev` output and
the code disagree, the code wins and the config should be fixed.

## Quick reference

```bash
./dev doctor              # environment + repo health (FAIL vs WARN)
./dev status              # branch/dirty/systems/tests/save summary
./dev map [--write|--check]  # system map; --write regenerates .dev/project-map.json
./dev authority [id]      # authority map; e.g. 'save-format', 'buildings'
./dev authority --check   # verify every referenced path exists
./dev impact <t>          # blast radius of a path/system/authority
./dev scope [t]           # likely-in-scope files (or classify current diff)
./dev context <t>         # agent-ready context packet for a system/concept
./dev handoff [t]         # handoff packet for the next agent
./dev save-check          # save schema + codec + offline + integrity gates
./dev smoke               # fast "repo isn't obviously broken" gate
./dev check [--quick]     # aggregate gate (always includes regression — it's <100ms)
```

`<t>` accepts a system id (`buildings`, `persistence`, `simulation`…), a
concept alias (`milestone`, `save`, `goal`…), an authority id
(`save-format`, `script-order`…), or a repo path (`src/save.js`).

## Files

```
dev                        bash front door → node scripts/dev/cli.js
.dev/systems.json          system registry (path prefixes → system buckets)
.dev/authority-map.json    curated authority map (verified against real code)
.dev/project-map.json      GENERATED — systems × files × tests × Game-graph
scripts/dev/*.js           zero-dependency CommonJS commands
scripts/dev/lib/repo.js    shared helpers (paths, files, git)
scripts/dev/lib/gameLoad.js vm sandbox loader — same technique as the
                            regression suite, used by save-check/smoke
tests/dev-infra.test.js    self-tests (same custom runner as the suite)
```

## The model

**Systems** (`.dev/systems.json`) bucket every file. `paths` are prefixes:
`'tests/'` matches a directory, `'*.md'` matches by suffix, `'src/save.js'`
is an exact path. First match wins. Every file lands in exactly one system;
`unmapped` means the config is incomplete (doctor warns).

**Authorities** (`.dev/authority-map.json`) say, per concept: where the
source of truth lives (`authority`), `kind` (code vs spec), what is
`persisted`, where `mutation` happens, how it is `validation`-ed, and the
`notes` that a newcomer would otherwise learn by breaking something.
`./dev authority --check` proves every referenced path still exists.

**project-map.json** joins the two plus the **Game-namespace dependency
graph**. Incremental has no `import` statements — modules attach to the
shared `window.Game` object — so dependencies are derived from which
`Game.X` symbols each file *defines* (`Game.X = function|{|[|literal`)
vs *references*. `dependsOn`/`dependents` are therefore real call-graph
edges, not filename guesses. `scriptOrder` records whether
`index.html`'s `<script src>` order matches the test harness's
`SCRIPT_ORDER`+`main` — a divergence check the repo previously had no
direct assertion for.

## save-check

`./dev save-check` exercises the real `src/save.js` in a vm sandbox:

- authority wiring: `SAVE_KEY 'ashfall_save_v1'`, `normalizeState`,
  `encodeSaveCode`, `decodeSaveCode`, `applyOfflineProgress` all present;
- fresh-schema keys exist;
- **legacy saves**: a minimal old save gains every missing section, keeps
  its values, and survives a tick without NaN;
- **codec roundtrip**: a rich state survives encode→decode, and
  achievements/stats stay OUT of the portable code (GDD §9 hybrid spec);
- **integrity gates**: corrupted checksum rejected, wrong field count
  rejected (that count IS the version gate), malformed input rejected,
  `assigned > total` decodes to a reset;
- **offline**: 10 min → 600 s simulated, 24 h → capped at `OFFLINE_MAX_SECONDS`
  (8 h), sub-5 s ignored;
- the real `tests/regression.test.js` still passes.

Run it when touching `src/save.js`, `src/state.js`, `createInitialState`,
or the codec.

## smoke vs check

- `smoke` (~instant): loads all 8 src modules in the real script order,
  checks key lists/BUILDING_DEFS coverage/ACHIEVEMENT_DEFS, one milestone
  tick, a save-code roundtrip, a `getNextGoal` sanity.
- `check`: map/authority consistency + script-order consistency +
  save-check + smoke + the full `tests/regression.test.js`. The whole
  suite is <100 ms, so check always runs everything; `--quick` skips the
  regression step for a faster loop.

Neither replaces the product rule: **after any `src/`/`index.html`/
`style.css` change, run `scripts/build-artifact.sh`** — the regression
suite byte-compares `artifact/game.html` against the sources.

## Adding a system

1. Pick an id + title and path prefixes that cover the real files.
2. Put it in `.dev/systems.json`.
3. `./dev map --write && ./dev doctor` (unmapped files appear at the
   bottom of `./dev map`).

## Updating authority safely

- Point at real files only — `authority --check` and the self-test catch
  typos.
- `notes` = the invariant a careless edit would violate.
- If two entries claim the same file, treat it as a signal — don't silently
  pick one in the JSON; resolve it in the code/docs.

## Regeneration / recovery

Everything lives in Git. On a fresh clone `./dev map --write` rebuilds the
map deterministically; the committed `.dev/project-map.json` is itself
reproducible.
