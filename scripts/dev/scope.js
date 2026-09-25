'use strict';

var repo = require('./lib/repo');
var map = require('./map');

function runScope(args) {
  var target = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];
  var m = map.getMap();
  var status = repo.gitStatus();

  if (!target) {
    var lines = map.heading('scope: current working tree');
    if (status.length === 0) {
      lines.push('worktree clean — nothing to classify. Usage: ./dev scope <system|authority>');
      console.log(lines.join('\n'));
      return;
    }
    var groups = {};
    status.forEach(function (entry) {
      var cat = map.classifyFile(entry.path);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry.state + ' ' + entry.path);
    });
    Object.keys(groups).sort().forEach(function (cat) {
      lines.push.apply(lines, map.section(cat));
      groups[cat].forEach(function (f) { lines.push('  ' + f); });
    });
    var changed = status.map(function (s) { return s.path; });
    var auths = m.authorities.filter(function (a) {
      return a.resolvedFiles.some(function (f) { return changed.indexOf(f) !== -1; });
    });
    if (auths.length) {
      lines.push.apply(lines, map.section('touched authorities — verify invariants before pushing'));
      auths.forEach(function (a) { lines.push('  ' + a.id + ' — ' + a.title); });
      if (changed.indexOf('src/save.js') !== -1 || changed.indexOf('src/state.js') !== -1) {
        lines.push('  SAVE SURFACE touched → run ./dev save-check');
      }
      if (changed.some(function (f) { return f.indexOf('src/') === 0 || f === 'index.html' || f === 'style.css'; })) {
        lines.push('  game files touched → regenerate artifact via scripts/build-artifact.sh');
      }
    }
    console.log(lines.join('\n'));
    return;
  }

  var system = map.findSystem(m, target);
  var authority = map.findAuthority(m, target);
  if (!system && !authority) {
    console.error("no system or authority matches '" + target + "'");
    process.exit(1);
  }

  var lines = map.heading('scope: ' + target);
  if (system) {
    lines.push('LIKELY IN SCOPE — system ' + system.id + ' (' + system.files.length + ' files)');
    system.files.slice(0, 40).forEach(function (f) { lines.push('  ' + f); });
    if (system.files.length > 40) lines.push('  … and ' + (system.files.length - 40) + ' more');
    if (system.tests.length) {
      lines.push('', 'RELATED TESTS (' + system.tests.length + ')');
      system.tests.forEach(function (t) { lines.push('  ' + t); });
    }
    if (system.docs.length) lines.push('', 'DOCS', system.docs.map(function (d) { return '  ' + d; }).join('\n'));
    if (system.dependsOn.length) {
      lines.push('', 'DEPENDS ON (read, usually do not touch)', '  ' + system.dependsOn.join(', '));
    }
  }
  if (authority) {
    lines.push('OTHER AUTHORITY — ' + authority.id + ': ' + authority.title);
    lines.push('  source of truth:');
    authority.authority.forEach(function (f) { lines.push('  ' + f); });
    if (authority.persisted) lines.push('  saved: ' + authority.persisted);
    if (authority.notes) lines.push('  invariants: ' + authority.notes);
  }
  if (system) {
    var others = m.authorities.filter(function (a) { return a.systemsTouched.indexOf(system.id) === -1; });
    if (others.length) {
      lines.push('', 'DO NOT TOUCH WITHOUT EXPLICIT NEED — other authority owners:');
      others.slice(0, 10).forEach(function (a) { lines.push('  ' + (a.id + '              ').slice(0, 14) + ' ' + a.title); });
    }
    if (system.files.some(function (f) { return f.indexOf('src/') === 0; })) {
      lines.push('', 'NOTE: editing src/* requires artifact regen (scripts/build-artifact.sh) — the sync test enforces it.');
    }
  }
  console.log(lines.join('\n'));
}

module.exports = { runScope: runScope };
