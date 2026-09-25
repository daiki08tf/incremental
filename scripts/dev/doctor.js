'use strict';

var fs = require('fs');
var repo = require('./lib/repo');
var map = require('./map');

var failures = 0;
var warnings = 0;

function pass(msg) { console.log('  PASS  ' + msg); }
function warn(msg) { warnings += 1; console.log('  WARN  ' + msg); }
function fail(msg) { failures += 1; console.log('  FAIL  ' + msg); }

function runDoctor() {
  console.log(map.heading('Incremental — doctor').join('\n'));

  console.log(map.section('environment').join('\n'));
  var nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor >= 18) pass('node ' + process.versions.node);
  else fail('node ' + process.versions.node + ' — too old for vm/test usage');
  pass('zero npm dependencies (no package.json required)');

  console.log(map.section('required paths').join('\n'));
  var required = [
    'index.html', 'style.css',
    'src/state.js', 'src/buildings.js', 'src/resources.js', 'src/survivors.js',
    'src/prestige.js', 'src/achievements.js', 'src/save.js', 'src/ui.js', 'src/main.js',
    'tests/regression.test.js',
    'docs/GDD.md', 'artifact/game.html', 'scripts/build-artifact.sh',
    '.dev/systems.json', '.dev/authority-map.json', 'dev', 'scripts/dev/cli.js',
  ];
  required.forEach(function (p) {
    if (repo.pathExists(p)) pass(p);
    else fail(p + ' missing');
  });

  console.log(map.section('script order consistency').join('\n'));
  var m = map.buildProjectMap();
  if (m.scriptOrder.consistent) {
    pass('index.html script order == test harness order (' + m.scriptOrder.indexHtml.length + ' modules)');
  } else {
    fail('script order mismatch — index.html: ' + JSON.stringify(m.scriptOrder.indexHtml) +
      ' vs test: ' + JSON.stringify(m.scriptOrder.testHarness));
  }

  console.log(map.section('dev-infra config').join('\n'));
  var systems = map.loadSystems();
  var authorities = map.loadAuthorities();
  if (systems.length) pass('.dev/systems.json: ' + systems.length + ' systems');
  else fail('.dev/systems.json empty or unparseable');
  if (authorities.length) pass('.dev/authority-map.json: ' + authorities.length + ' authorities');
  else fail('.dev/authority-map.json empty or unparseable');

  var missing = m.authorities.reduce(function (acc, a) {
    return acc.concat(a.missingPaths.map(function (p) { return a.id + ': ' + p; }));
  }, []);
  if (missing.length === 0) pass('all authority-map paths resolve');
  else {
    fail(missing.length + ' authority-map path(s) missing:');
    missing.forEach(function (p) { console.log('        ' + p); });
  }

  var unmappedCode = m.unmappedFiles.filter(function (f) { return f.slice(-3) === '.js'; });
  if (unmappedCode.length === 0) pass('every code file maps to a system');
  else {
    warn(unmappedCode.length + ' code file(s) unmapped — add a prefix to .dev/systems.json:');
    unmappedCode.slice(0, 15).forEach(function (f) { console.log('        ' + f); });
  }

  var res = map.mapIsFresh();
  if (!fs.existsSync(repo.abs(map.MAP_PATH))) warn('.dev/project-map.json not generated — run ./dev map --write');
  else if (res.fresh) pass('.dev/project-map.json fresh');
  else warn('.dev/project-map.json stale (' + res.reason + ') — run ./dev map --write');

  console.log(map.section('git').join('\n'));
  var status = repo.gitStatus();
  if (status.length === 0) pass('worktree clean');
  else warn('worktree dirty (' + status.length + ' entries) — advisory only');

  console.log('');
  console.log('doctor: ' + failures + ' fail, ' + warnings + ' warn');
  process.exit(failures === 0 ? 0 : 1);
}

module.exports = { runDoctor: runDoctor };
