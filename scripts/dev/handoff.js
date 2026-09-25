'use strict';

var repo = require('./lib/repo');
var map = require('./map');

function runHandoff(args) {
  var target = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];
  var m = map.getMap();
  var status = repo.gitStatus();

  var lines = map.heading('Incremental — handoff packet');
  lines.push('branch: ' + repo.gitBranch() + ' @ ' + repo.gitHead());
  lines.push('worktree: ' + (status.length === 0 ? 'clean' : status.length + ' change(s)'));

  if (target) {
    var system = map.findSystem(m, target);
    var authority = map.findAuthority(m, target);
    if (!system && !authority) {
      console.error("no system or authority matches '" + target + "'");
      process.exit(1);
    }
    lines.push('\ntarget: ' + target);
    if (authority) {
      lines.push.apply(lines, map.section('authority').concat('  ' + authority.title));
      authority.authority.forEach(function (f) { lines.push('  ' + f); });
      if (authority.persisted) lines.push('  saved: ' + authority.persisted);
      if (authority.notes) lines.push.apply(lines, map.section('constraints for next agent').concat('  ' + authority.notes));
      if (authority.validation) lines.push('  validation: ' + authority.validation);
    }
    if (system) {
      lines.push.apply(lines, map.section('system: ' + system.id + ' — ' + system.title));
      lines.push('  files: ' + system.files.length + ' (see .dev/project-map.json for the full list)');
      system.files.slice(0, 15).forEach(function (f) { lines.push('    ' + f); });
      if (system.files.length > 15) lines.push('    … ' + (system.files.length - 15) + ' more');
      if (system.tests.length) {
        lines.push('  tests: ' + system.tests.length);
        system.tests.slice(0, 10).forEach(function (t) { lines.push('    ' + t); });
      }
      if (system.docs.length) {
        lines.push.apply(lines, map.section('docs'));
        system.docs.forEach(function (d) { lines.push('  ' + d); });
      }
      if (system.dependsOn.length) lines.push('  depends on: ' + system.dependsOn.join(', '));
    }
  } else {
    var groups = {};
    status.forEach(function (entry) {
      var cat = map.classifyFile(entry.path);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry.state + ' ' + entry.path);
    });
    if (Object.keys(groups).length) {
      lines.push.apply(lines, map.section('uncommitted changes by area'));
      Object.keys(groups).sort().forEach(function (cat) {
        lines.push('  ' + cat + ':');
        groups[cat].forEach(function (f) { lines.push('    ' + f); });
      });
      var changed = status.map(function (s) { return s.path; });
      var auths = m.authorities.filter(function (a) {
        return a.resolvedFiles.some(function (f) { return changed.indexOf(f) !== -1; });
      });
      if (auths.length) {
        lines.push.apply(lines, map.section('authorities touched — invariants to verify'));
        auths.forEach(function (a) {
          lines.push('  ' + a.id + ' — ' + a.title);
          if (a.notes) lines.push('    ' + a.notes);
        });
        if (changed.indexOf('src/save.js') !== -1 || changed.indexOf('src/state.js') !== -1) {
          lines.push('  → save surface touched: ./dev save-check');
        }
        if (changed.some(function (f) { return f.indexOf('src/') === 0 || f === 'index.html' || f === 'style.css'; })) {
          lines.push('  → artifact regen needed: scripts/build-artifact.sh');
        }
      }
    }
  }

  lines.push.apply(lines, map.section('next-agent checklist'));
  lines.push('  1. read docs/GDD.md for spec intent; check file headers for MVP simplifications');
  lines.push('  2. ./dev doctor                    — environment + config sanity');
  lines.push('  3. ./dev save-check                — if save/codec/state touched');
  lines.push('  4. scripts/build-artifact.sh       — after ANY src/index/css change');
  lines.push('  5. node tests/regression.test.js   — full suite, <1s, before every commit');
  lines.push('  6. ./dev check                     — aggregate gate before handoff');
  console.log(lines.join('\n'));
}

module.exports = { runHandoff: runHandoff };
