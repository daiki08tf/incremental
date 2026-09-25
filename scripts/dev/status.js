'use strict';

var fs = require('fs');
var repo = require('./lib/repo');
var map = require('./map');

function runStatus() {
  var m = map.getMap();
  var status = repo.gitStatus();
  var modified = status.filter(function (s) { return s.state.indexOf('?') === -1; }).length;
  var untracked = status.filter(function (s) { return s.state.indexOf('?') !== -1; }).length;
  var res = map.mapIsFresh();
  var missing = m.authorities.reduce(function (acc, a) { return acc.concat(a.missingPaths); }, []);

  var lines = map.heading('Incremental — status');
  lines.push(
    'repo        ' + repo.gitBranch() + ' @ ' + repo.gitHead(),
    'remote      ' + (repo.gitRemote() || 'none'),
    'worktree    ' + (status.length === 0 ? 'clean' : modified + ' modified, ' + untracked + ' untracked'),
    '',
    'systems     ' + m.systems.length + ' defined',
    'authorities ' + m.authorities.length + ' defined',
    'tests       ' + m.meta.fileCounts.tests + ' file(s) — node tests/regression.test.js',
    'save        localStorage \'' + 'ashfall_save_v1' + '\' + save-code codec (src/save.js)',
    'map         ' + (fs.existsSync(repo.abs(map.MAP_PATH))
      ? (res.fresh ? 'fresh' : 'STALE (' + res.reason + ') — ./dev map --write')
      : 'not generated — ./dev map --write')
  );
  if (missing.length) lines.push('', 'authority refs missing: ' + missing.length,
    missing.slice(0, 10).map(function (p) { return '  ' + p; }).join('\n'));
  if (m.unmappedFiles.length) lines.push('unmapped: ' + m.unmappedFiles.length + ' file(s) — ./dev map for detail');
  console.log(lines.join('\n'));
}

module.exports = { runStatus: runStatus };
