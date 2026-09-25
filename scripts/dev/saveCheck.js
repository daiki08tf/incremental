'use strict';
/* save-check — exercises the REAL persistence code (src/save.js + state.js)
   via the vm harness. Checks: authority presence, legacy-save normalization,
   save-code codec roundtrip, checksum corruption rejection, field-count
   version gate, assigned>total decode invariant, offline caps. */

var map = require('./map');
var gameLoad = require('./lib/gameLoad');
var repo = require('./lib/repo');
var fs = require('fs');

var failures = 0;
var warnings = 0;

function pass(msg) { console.log('  PASS  ' + msg); }
function warn(msg) { warnings += 1; console.log('  WARN  ' + msg); }
function fail(msg) { failures += 1; console.log('  FAIL  ' + msg); }

function summarize() {
  console.log('');
  console.log('save-check: ' + failures + ' fail, ' + warnings + ' warn');
  process.exit(failures === 0 ? 0 : 1);
}

function runSaveCheck() {
  console.log(map.heading('Incremental — save-check').join('\n'));

  // 1. Save authority wiring still present.
  console.log(map.section('save authority').join('\n'));
  var stateSrc = fs.readFileSync(repo.abs('src/state.js'), 'utf8');
  var saveSrc = fs.readFileSync(repo.abs('src/save.js'), 'utf8');
  ["'ashfall_save_v1'", 'SAVE_KEY', 'OFFLINE_MAX_SECONDS'].forEach(function (marker) {
    if (stateSrc.indexOf(marker) !== -1) pass('src/state.js contains ' + marker);
    else fail('src/state.js missing ' + marker);
  });
  ['normalizeState', 'encodeSaveCode', 'decodeSaveCode', 'applyOfflineProgress'].forEach(function (marker) {
    if (saveSrc.indexOf(marker) !== -1) pass('src/save.js contains ' + marker);
    else fail('src/save.js missing ' + marker);
  });

  var Game = gameLoad.loadGame();

  // 2. Fresh schema keys.
  console.log(map.section('schema').join('\n'));
  var fresh = Game.createInitialState();
  ['resources', 'buildings', 'survivors', 'prestige', 'achievements', 'stats', 'clickLevel', 'lastActiveTime'].forEach(function (key) {
    if (key in fresh) pass("fresh save has '" + key + "'");
    else fail("fresh save missing '" + key + "'");
  });

  // 3. Legacy save → normalizeState fill.
  console.log(map.section('legacy save normalization').join('\n'));
  var legacy = { resources: { wood: 5 }, buildings: { woodcutter: 3 } };
  var normalized = Game.normalizeState(legacy);
  if (normalized.buildings.miner === 0 && normalized.prestige.upgrades && normalized.achievements && normalized.stats) {
    pass('legacy save gains all missing sections (no undefined)');
  } else fail('normalizeState did not fill missing sections');
  if (normalized.resources.wood === 5 && normalized.buildings.woodcutter === 3) pass('existing values preserved');
  else fail('normalizeState overwrote existing values');
  var tickOk = true;
  var prevState = Game.state;
  Game.state = normalized;
  try { Game.tick(1); } catch (e) { tickOk = false; }
  Game.state = prevState;
  Game.RESOURCE_KEYS.forEach(function (k) {
    if (Number.isNaN(normalized.resources[k])) { tickOk = false; }
  });
  if (tickOk) pass('normalized legacy save survives a tick without NaN');
  else fail('tick on normalized save produced NaN/exception');

  // 4. Save-code roundtrip.
  console.log(map.section('save-code codec').join('\n'));
  var rich = Game.createInitialState();
  rich.resources = { wood: 123.45, metal: 67.89, food: 30, power: 0, components: 4.2 };
  rich.buildings = { woodcutter: 7, miner: 2, farm: 1, generator: 0, refinery: 0 };
  rich.survivors.total = 3;
  rich.survivors.assigned = { woodcutter: 2, miner: 1, farm: 0, generator: 0, refinery: 0 };
  rich.clickLevel = 4;
  rich.prestige = { count: 2, knowledge: 9.5, upgrades: { productionBoost: 1, startingWood: 2, populationCap: 0, foodEfficiency: 1 } };
  var code = Game.encodeSaveCode(rich);
  var decoded;
  try {
    decoded = Game.decodeSaveCode(code);
    pass('encode → decode roundtrip parses');
  } catch (e) {
    fail('decodeSaveCode threw on own encode output: ' + e.message);
    return summarize();
  }
  var fieldsOk =
    Math.abs(decoded.resources.wood - 123.45) < 0.01 &&
    decoded.buildings.woodcutter === 7 &&
    decoded.survivors.total === 3 &&
    decoded.survivors.assigned.woodcutter === 2 &&
    decoded.clickLevel === 4 &&
    decoded.prestige.count === 2 &&
    decoded.prestige.upgrades.startingWood === 2;
  if (fieldsOk) pass('roundtrip preserves resources/buildings/survivors/prestige/clickLevel');
  else fail('roundtrip lost fields: ' + JSON.stringify({ res: decoded.resources, b: decoded.buildings, s: decoded.survivors }));

  // spec: achievements/stats intentionally NOT in the portable code
  if (Object.keys(decoded.achievements).length === 0 && decoded.stats.totalClicks === 0) {
    pass('achievements/stats excluded from save-code per GDD §9 hybrid spec');
  } else fail('save-code leaked achievements/stats — spec violation');

  // 5. Corruption + version gates.
  console.log(map.section('integrity gates').join('\n'));
  var corrupted = code.slice(0, -1) + (code.slice(-1) === '0' ? '1' : '0');
  try {
    Game.decodeSaveCode(corrupted);
    fail('corrupted checksum accepted');
  } catch (e) { pass('corrupted checksum rejected'); }
  var shortCode = code.split('_')[0].split('.').slice(0, -1).join('.');
  try {
    Game.decodeSaveCode(shortCode + '_xxxx');
    fail('wrong field count accepted (version gate broken)');
  } catch (e) { pass('wrong field count rejected (version gate)'); }
  try {
    Game.decodeSaveCode('not-a-code');
    fail('malformed code accepted');
  } catch (e) { pass('malformed code rejected'); }

  // decode invariant: assigned > total → assignments reset
  var bad = Game.createInitialState();
  bad.survivors.total = 1;
  bad.survivors.assigned = { woodcutter: 5, miner: 0, farm: 0, generator: 0, refinery: 0 };
  var decodedBad = Game.decodeSaveCode(Game.encodeSaveCode(bad));
  var assignedSum = Game.BUILDING_KEYS.reduce(function (s, k) { return s + decodedBad.survivors.assigned[k]; }, 0);
  if (assignedSum === 0) pass('assigned>total decodes to reset assignments');
  else fail('assigned>total survived decode: ' + assignedSum);

  // 6. Offline progress caps.
  console.log(map.section('offline progress').join('\n'));
  var offline = Game.createInitialState();
  offline.lastActiveTime = Date.now() - 10 * 60 * 1000; // 10 minutes
  var seconds = Game.applyOfflineProgress(offline);
  if (seconds === 600) pass('10min offline → 600 simulated seconds');
  else fail('offline elapsed mismatch: ' + seconds);
  var far = Game.createInitialState();
  far.lastActiveTime = Date.now() - 24 * 60 * 60 * 1000; // 24h
  var capped = Game.applyOfflineProgress(far);
  if (capped === Game.OFFLINE_MAX_SECONDS) pass('24h offline capped at ' + Game.OFFLINE_MAX_SECONDS + 's (8h)');
  else fail('offline cap broken: ' + capped);
  var tiny = Game.createInitialState();
  tiny.lastActiveTime = Date.now() - 2000; // 2s
  if (Game.applyOfflineProgress(tiny) === 0) pass('sub-5s offline ignored');
  else fail('tiny offline not ignored');

  // 7. Existing regression test still passes.
  console.log(map.section('existing regression suite').join('\n'));
  try {
    var out = require('child_process').execSync('node tests/regression.test.js', { cwd: repo.ROOT, encoding: 'utf8' });
    var match = out.match(/(\d+) passed, (\d+) failed/);
    if (match && Number(match[2]) === 0) pass('regression.test.js: ' + match[1] + ' passed');
    else fail('regression.test.js reports failures');
  } catch (e) {
    fail('regression.test.js failed to run cleanly');
  }

  summarize();
}

module.exports = { runSaveCheck: runSaveCheck };
