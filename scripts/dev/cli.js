#!/usr/bin/env node
'use strict';
/* Incremental dev front door. Zero-dependency; plain node + CommonJS,
   matching the repo's existing style. */

var map = require('./map');
var doctor = require('./doctor');
var status = require('./status');
var authority = require('./authority');
var impact = require('./impact');
var scope = require('./scope');
var context = require('./context');
var handoff = require('./handoff');
var saveCheck = require('./saveCheck');
var smoke = require('./smoke');
var check = require('./check');

var USAGE = [
  'Incremental (漂流コロニー) dev front door',
  '',
  'usage: ./dev <command> [args]',
  '',
  'orientation',
  '  help                  this message',
  '  doctor                environment + repo health (FAIL vs WARN)',
  '  status                short dev state (branch, dirty, counts, save)',
  '  map [--write|--check] system map from .dev/systems.json (generated, deterministic)',
  '',
  'authority',
  '  authority [id]        authority map; <id> for detail; --check verifies paths',
  '  impact <t>            blast radius of a path / system / authority',
  '  scope [t]             likely-in-scope files (+ current diff when run bare)',
  '  context <t>           agent-ready context packet for a system/concept',
  '  handoff [t]           handoff packet (working tree, or focused on <t>)',
  '',
  'validation',
  '  save-check            save schema + codec roundtrip + offline + integrity gates',
  '  smoke                 fast sanity (module load, tick, save roundtrip, goal)',
  '  check [--quick]       aggregate gate (always includes regression suite — it is <100ms)',
  '',
  'targets <t> accept: system id (state, buildings, simulation, prestige…),',
  'concept (save, milestone, goal…), authority id (save-format, buildings…),',
  'or a repo path (src/save.js).',
  '',
].join('\n');

var COMMANDS = {
  help: function () { console.log(USAGE); },
  doctor: doctor.runDoctor,
  status: status.runStatus,
  map: map.runMap,
  authority: authority.runAuthority,
  impact: impact.runImpact,
  scope: scope.runScope,
  context: context.runContext,
  handoff: handoff.runHandoff,
  'save-check': saveCheck.runSaveCheck,
  smoke: smoke.runSmoke,
  check: check.runCheck,
};

var argv = process.argv.slice(2);
var cmd = argv[0];
var args = argv.slice(1);

// doctor --order-only is used internally by check to isolate the script-order gate.
if (cmd === 'doctor' && args.indexOf('--order-only') !== -1) {
  var m = map.buildProjectMap();
  if (m.scriptOrder.consistent) {
    console.log('script order consistent (' + m.scriptOrder.indexHtml.length + ' modules)');
    process.exit(0);
  }
  console.error('script order MISMATCH\n  index.html: ' + m.scriptOrder.indexHtml.join(', ') +
    '\n  test harness: ' + m.scriptOrder.testHarness.join(', '));
  process.exit(1);
}

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(USAGE);
  process.exit(0);
}

var fn = COMMANDS[cmd];
if (!fn) {
  console.error("unknown command '" + cmd + "'\n");
  console.log(USAGE);
  process.exit(1);
}

try {
  fn(args);
} catch (e) {
  console.error('dev ' + cmd + ' failed: ' + e.message);
  if (process.env.DEV_DEBUG) console.error(e.stack);
  process.exit(1);
}
