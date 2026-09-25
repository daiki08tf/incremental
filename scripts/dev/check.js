'use strict';
/* check — aggregate developer gate. The full regression suite is ~80ms,
   so there is no quick/full split: check always runs everything. */

var execSync = require('child_process').execSync;
var repo = require('./lib/repo');
var map = require('./map');

var STEPS = [
  ['authority map resolves', 'node scripts/dev/cli.js authority --check'],
  ['project-map freshness', 'node scripts/dev/cli.js map --check'],
  ['script-order consistency', 'node scripts/dev/cli.js doctor --order-only'],
  ['save-check', 'node scripts/dev/cli.js save-check'],
  ['smoke', 'node scripts/dev/cli.js smoke'],
  ['regression suite', 'node tests/regression.test.js'],
];

function runCheck(args) {
  var quick = args.indexOf('--quick') !== -1 || args.indexOf('-q') !== -1;
  var steps = quick ? STEPS.slice(0, 5) : STEPS;

  console.log(map.heading('Incremental — check' + (quick ? ' (quick)' : '')).join('\n'));
  console.log(steps.map(function (s, i) { return '  ' + (i + 1) + '. ' + s[0] + '  →  ' + s[1]; }).join('\n') + '\n');

  var failed = [];
  steps.forEach(function (step) {
    process.stdout.write('\n▶ ' + step[0] + ' … ');
    try {
      execSync(step[1], { cwd: repo.ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
      console.log('OK');
    } catch (e) {
      console.log('FAIL');
      failed.push([step[0], step[1], String(e.stdout || '') + String(e.stderr || '')]);
    }
  });

  console.log('\n' + '='.repeat(50));
  if (failed.length === 0) {
    console.log('check: all ' + steps.length + ' steps OK');
    return;
  }
  console.log('check: ' + failed.length + '/' + steps.length + ' steps FAILED');
  failed.forEach(function (f) {
    console.log('\n--- ' + f[0] + ' (' + f[1] + ') ---');
    console.log(f[2].split('\n').slice(-25).join('\n'));
  });
  process.exit(1);
}

module.exports = { runCheck: runCheck };
