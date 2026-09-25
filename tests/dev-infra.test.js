/* =========================================================
   tests/dev-infra.test.js
   Self-tests for the ./dev tooling — same custom-runner style and
   zero dependencies as tests/regression.test.js.

   実行方法:
     node tests/dev-infra.test.js
   ========================================================= */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;

var ROOT = path.resolve(__dirname, '..');
var map = require('../scripts/dev/map');
var gameLoad = require('../scripts/dev/lib/gameLoad');

var passed = 0;
var failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok   ' + name);
  } catch (error) {
    failures.push(name);
    console.log('FAIL ' + name);
    console.log('     ' + (error && error.message));
  }
}

function dev(args) {
  return execSync('node scripts/dev/cli.js ' + args, { cwd: ROOT, encoding: 'utf8' });
}

function devFails(args) {
  var failed = false;
  try {
    execSync('node scripts/dev/cli.js ' + args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    failed = true;
  }
  assert.ok(failed, 'expected `dev ' + args + '` to exit non-zero');
}

// One shared build per run.
var builtMap = map.buildProjectMap();

// ---------- config validation ----------

test('systems config: every system has id/title/paths, ids unique', function () {
  var systems = map.loadSystems();
  assert.ok(systems.length >= 10, 'expected >= 10 systems');
  var ids = {};
  systems.forEach(function (s) {
    assert.ok(s.id, 'system missing id');
    assert.ok(s.title, s.id + ' missing title');
    assert.ok(Array.isArray(s.paths) && s.paths.length > 0, s.id + ' missing paths');
    assert.ok(!ids[s.id], 'duplicate system id ' + s.id);
    ids[s.id] = true;
  });
});

test('authority-map config: every authority has id/title/authority, ids unique', function () {
  var auths = map.loadAuthorities();
  assert.ok(auths.length >= 10, 'expected >= 10 authorities');
  var ids = {};
  auths.forEach(function (a) {
    assert.ok(a.id, 'authority missing id');
    assert.ok(a.title, a.id + ' missing title');
    assert.ok(Array.isArray(a.authority) && a.authority.length > 0, a.id + ' missing authority list');
    assert.ok(!ids[a.id], 'duplicate authority id ' + a.id);
    ids[a.id] = true;
  });
});

// ---------- map generation ----------

test('buildProjectMap: deterministic across builds', function () {
  var again = map.buildProjectMap();
  var strip = function (m) {
    var copy = JSON.parse(JSON.stringify(m));
    copy.meta.git = null;
    return copy;
  };
  assert.deepEqual(strip(again), strip(builtMap), 'map is not deterministic');
});

test('buildProjectMap: every authority path resolves', function () {
  var missing = [];
  builtMap.authorities.forEach(function (a) {
    a.missingPaths.forEach(function (p) { missing.push(a.id + ': ' + p); });
  });
  assert.deepEqual(missing, [], 'authority-map references files that do not exist');
});

test('buildProjectMap: every code file belongs to a system', function () {
  var unmapped = builtMap.unmappedFiles.filter(function (f) { return f.slice(-3) === '.js'; });
  assert.deepEqual(unmapped, [], 'unmapped code files — extend .dev/systems.json');
});

test('buildProjectMap: Game-namespace edges are real', function () {
  var persistence = builtMap.systems.find(function (s) { return s.id === 'persistence'; });
  // save.js calls Game.tick (simulation), getUnassignedSurvivors (survivors),
  // createInitialState + key constants (state)
  ['simulation', 'state', 'survivors'].forEach(function (dep) {
    assert.ok(persistence.dependsOn.indexOf(dep) !== -1, 'persistence should depend on ' + dep);
  });
  var runtime = builtMap.systems.find(function (s) { return s.id === 'runtime'; });
  assert.ok(runtime.dependsOn.indexOf('persistence') !== -1, 'runtime should depend on persistence');
});

test('script order: index.html and test harness agree', function () {
  assert.strictEqual(builtMap.scriptOrder.consistent, true,
    'index.html: ' + builtMap.scriptOrder.indexHtml + ' vs test: ' + builtMap.scriptOrder.testHarness);
  assert.strictEqual(builtMap.scriptOrder.indexHtml.length, 9);
});

test('committed project-map.json is fresh', function () {
  assert.ok(fs.existsSync(path.join(ROOT, map.MAP_PATH)), map.MAP_PATH + ' missing — run ./dev map --write');
  var res = map.mapIsFresh();
  assert.ok(res.fresh, map.MAP_PATH + ' is ' + res.reason + ' — run ./dev map --write');
});

// ---------- resolution / classification ----------

test('system and authority resolution', function () {
  assert.strictEqual(map.findSystem(builtMap, 'buildings').id, 'buildings');
  assert.strictEqual(map.findSystem(builtMap, 'milestone').id, 'buildings', 'concept alias');
  assert.strictEqual(map.findSystem(builtMap, 'save').id, 'persistence', 'concept alias');
  assert.strictEqual(map.findSystem(builtMap, 'nope-not-real'), undefined);
  assert.strictEqual(map.findAuthority(builtMap, 'save-format').id, 'save-format');
  assert.strictEqual(map.findAuthority(builtMap, 'nope'), undefined);
});

test('classifyFile sorts paths into the expected buckets', function () {
  assert.strictEqual(map.classifyFile('src/state.js'), 'save');
  assert.strictEqual(map.classifyFile('src/save.js'), 'save');
  assert.strictEqual(map.classifyFile('src/resources.js'), 'src');
  assert.strictEqual(map.classifyFile('tests/regression.test.js'), 'tests');
  assert.strictEqual(map.classifyFile('docs/GDD.md'), 'docs');
  assert.strictEqual(map.classifyFile('artifact/game.html'), 'generated');
  assert.strictEqual(map.classifyFile('scripts/dev/cli.js'), 'devtools');
  assert.strictEqual(map.classifyFile('index.html'), 'shell');
});

test('save authority resolves both owners', function () {
  var save = builtMap.authorities.find(function (a) { return a.id === 'save-format'; });
  assert.ok(save.resolvedFiles.indexOf('src/save.js') !== -1);
  assert.ok(save.resolvedFiles.indexOf('src/state.js') !== -1);
});

// ---------- vm harness ----------

test('gameLoad loads all modules and stubs UI', function () {
  var Game = gameLoad.loadGame();
  assert.ok(Game.createInitialState, 'state.js not loaded');
  assert.ok(Game.BUILDING_DEFS, 'buildings.js not loaded');
  assert.ok(Game.tick, 'resources.js not loaded');
  assert.ok(Game.encodeSaveCode, 'save.js not loaded');
  assert.strictEqual(typeof Game.render, 'function');
});

// ---------- CLI ----------

test('cli: help lists all commands', function () {
  var out = dev('help');
  ['doctor', 'status', 'map', 'authority', 'impact', 'scope', 'context', 'handoff', 'save-check', 'smoke', 'check'].forEach(function (cmd) {
    assert.ok(out.indexOf(cmd) !== -1, 'help missing ' + cmd);
  });
});

test('cli: unknown command exits non-zero', function () {
  devFails('frobnicate');
});

test('cli: authority --check exits clean', function () {
  var out = dev('authority --check');
  assert.ok(out.indexOf('authority map OK') !== -1);
});

test('cli: authority on unknown id exits non-zero', function () {
  devFails('authority definitely-not-real');
});

test('cli: map --check passes on committed map', function () {
  var out = dev('map --check');
  assert.ok(out.indexOf('fresh') !== -1);
});

test('cli: impact on a real path names its authority claim and save surface', function () {
  var out = dev('impact src/save.js');
  assert.ok(out.indexOf('claimed by authority') !== -1);
  assert.ok(out.indexOf('SAVE SURFACE') !== -1);
});

test('cli: context on a system prints packet sections', function () {
  var out = dev('context buildings');
  assert.ok(out.indexOf('AUTHORITY') !== -1);
  assert.ok(out.indexOf('source of truth') !== -1);
});

test('cli: doctor --order-only passes', function () {
  var out = dev('doctor --order-only');
  assert.ok(out.indexOf('consistent') !== -1);
});

test('cli: save-check is green on the real repo', function () {
  var out = dev('save-check');
  assert.ok(out.indexOf('save-check: 0 fail') !== -1);
});

test('cli: smoke is green on the real repo', function () {
  var out = dev('smoke');
  assert.ok(out.indexOf('smoke: 0 fail') !== -1);
});

// ---------- results ----------

console.log('');
console.log(passed + ' passed, ' + failures.length + ' failed');
if (failures.length > 0) {
  failures.forEach(function (name) { console.log('  - ' + name); });
  process.exit(1);
}
