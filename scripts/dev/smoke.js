'use strict';
/* smoke — sub-second "repo isn't obviously broken" gate.
   Loads every src module in the real load order via the vm harness,
   then sanity-checks the core invariants. NOT the full suite. */

var map = require('./map');
var gameLoad = require('./lib/gameLoad');

var failures = 0;

function pass(msg) { console.log('  PASS  ' + msg); }
function fail(msg) { failures += 1; console.log('  FAIL  ' + msg); }

function runSmoke() {
  console.log(map.heading('Incremental — smoke').join('\n'));

  console.log(map.section('module load (script order)').join('\n'));
  var Game;
  try {
    Game = gameLoad.loadGame();
    pass('all ' + gameLoad.SCRIPT_ORDER.length + ' src modules load in SCRIPT_ORDER');
  } catch (e) {
    fail('module load failed: ' + e.message);
    console.log('\nsmoke: ' + failures + ' fail');
    process.exit(1);
  }

  console.log(map.section('core data sanity').join('\n'));
  if (Game.RESOURCE_KEYS.length === 5 && Game.BUILDING_KEYS.length === 5) {
    pass('resource/building key lists populated (5/5)');
  } else fail('key lists malformed');
  var defCount = Object.keys(Game.BUILDING_DEFS).length;
  if (defCount === Game.BUILDING_KEYS.length) {
    pass('BUILDING_DEFS covers every building key (' + defCount + ')');
  } else fail('BUILDING_DEFS/key mismatch: ' + defCount + ' vs ' + Game.BUILDING_KEYS.length);
  if (Game.ACHIEVEMENT_DEFS.length >= 10) pass('ACHIEVEMENT_DEFS populated (' + Game.ACHIEVEMENT_DEFS.length + ')');
  else fail('ACHIEVEMENT_DEFS unexpectedly small: ' + Game.ACHIEVEMENT_DEFS.length);

  console.log(map.section('simulation sanity').join('\n'));
  var state = Game.createInitialState();
  state.buildings.woodcutter = 10;
  Game.state = state;
  try {
    Game.tick(1);
    var expected = 0.6 * 10 * 1.15;
    if (Math.abs(state.resources.wood - expected) < 1e-9) {
      pass('tick applies milestone multiplier (10 woodcutters → ' + state.resources.wood + ' wood)');
    } else fail('tick output wrong: ' + state.resources.wood + ' != ' + expected);
    if (state.resources.wood >= 0 && !Number.isNaN(state.resources.metal)) pass('no NaN/negative resources after tick');
    else fail('tick produced invalid resources');
  } catch (e) {
    fail('tick threw: ' + e.message);
  }

  console.log(map.section('save roundtrip sanity').join('\n'));
  try {
    var s = Game.createInitialState();
    s.resources.wood = 42;
    var back = Game.decodeSaveCode(Game.encodeSaveCode(s));
    if (back.resources.wood === 42) pass('save-code roundtrip preserves values');
    else fail('save-code roundtrip lost data');
    var norm = Game.normalizeState({ resources: { wood: 1 } });
    if (norm.buildings && norm.prestige.upgrades) pass('normalizeState fills missing sections');
    else fail('normalizeState incomplete');
  } catch (e) {
    fail('save sanity threw: ' + e.message);
  }

  console.log(map.section('goal logic sanity').join('\n'));
  try {
    var goal = Game.getNextGoal(Game.createInitialState());
    if (goal && goal.kind === 'unlock') pass('fresh state → unlock goal');
    else fail('unexpected goal kind: ' + (goal && goal.kind));
  } catch (e) {
    fail('getNextGoal threw: ' + e.message);
  }

  console.log('');
  console.log('smoke: ' + failures + ' fail');
  console.log('full gate: ./dev check   (adds save-check + regression suite)');
  process.exit(failures === 0 ? 0 : 1);
}

module.exports = { runSmoke: runSmoke };
