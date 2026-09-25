'use strict';

var repo = require('./lib/repo');
var map = require('./map');

function runImpact(args) {
  var target = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];
  if (!target) map.fail('usage: ./dev impact <path|system|authority>');

  var m = map.getMap();
  var lines = map.heading('impact: ' + target);

  var system = map.findSystem(m, target);
  var authority = map.findAuthority(m, target);
  var asPath = target.replace(/^\.\//, '');
  var isFile = repo.pathExists(asPath);

  if (system) {
    lines.push('system: ' + system.id + ' — ' + system.title, '');
    if (system.dependents.length) {
      lines.push.apply(lines, map.section('depended on by (Game-namespace graph)'));
      system.dependents.forEach(function (d) { lines.push('  ' + d); });
    }
    if (system.dependsOn.length) {
      lines.push.apply(lines, map.section('depends on').concat('  ' + system.dependsOn.join(', ')));
    }
    if (system.tests.length) {
      lines.push.apply(lines, map.section('tests (' + system.tests.length + ')'));
      system.tests.forEach(function (t) { lines.push('  ' + t); });
    }
    if (system.docs.length) {
      lines.push.apply(lines, map.section('docs'));
      system.docs.forEach(function (d) { lines.push('  ' + d); });
    }
    var touched = m.authorities.filter(function (a) { return a.systemsTouched.indexOf(system.id) !== -1; });
    if (touched.length) {
      lines.push.apply(lines, map.section('authorities claiming files in this system'));
      touched.forEach(function (a) { lines.push('  ' + a.id + ' — ' + a.title); });
    }
    lines.push.apply(lines, map.section('files (' + system.files.length + ')'));
    system.files.slice(0, 30).forEach(function (f) { lines.push('  ' + f); });
  } else if (authority) {
    lines.push('authority: ' + authority.id + ' — ' + authority.title + '  [' + authority.kind + ']', '');
    lines.push.apply(lines, map.section('source of truth'));
    authority.authority.forEach(function (f) { lines.push('  ' + f); });
    if (authority.persisted) lines.push.apply(lines, map.section('persisted').concat('  ' + authority.persisted));
    if (authority.relatedTests.length) {
      lines.push.apply(lines, map.section('related tests (' + authority.relatedTests.length + ')'));
      authority.relatedTests.slice(0, 20).forEach(function (t) { lines.push('  ' + t); });
    }
    if (authority.notes) lines.push.apply(lines, map.section('notes').concat('  ' + authority.notes));
  } else if (isFile) {
    var owning = m.systems.find(function (s) { return s.files.indexOf(asPath) !== -1; });
    lines.push('file: ' + asPath, 'system: ' + (owning ? owning.id : 'unmapped'), '');
    var auths = m.authorities.filter(function (a) { return a.resolvedFiles.indexOf(asPath) !== -1; });
    if (auths.length) {
      lines.push.apply(lines, map.section('claimed by authority'));
      auths.forEach(function (a) {
        lines.push('  ' + a.id + ' — ' + a.title);
        if (a.persisted) lines.push('    saved: ' + a.persisted);
      });
    }
    // Game-namespace dependents: files that reference symbols defined here.
    var graph = require('./map'); // reuse built map edges via system lookup is per-system; rescan cheaply
    var deps = fileDependents(asPath);
    if (deps.length) {
      lines.push.apply(lines, map.section('dependents (' + deps.length + ')'));
      deps.forEach(function (d) { lines.push('  ' + d); });
    }
    if (asPath === 'artifact/game.html') {
      lines.push.apply(lines, map.section('GENERATED'), '  regenerate via scripts/build-artifact.sh — never edit directly');
    }
    if (auths.some(function (a) { return a.persisted; })) {
      lines.push.apply(lines, map.section('SAVE SURFACE'), '  touches persisted state — verify ./dev save-check');
    }
    if (!auths.length && !deps.length) {
      lines.push('', 'no authority claim and no dependents found — low blast radius (verify before assuming zero)');
    }
  } else {
    var known = m.systems.map(function (s) { return s.id; }).concat(m.authorities.map(function (a) { return a.id; })).join(', ');
    map.fail("unknown target '" + target + "' — not a system id, authority id, concept, or existing path\n  known: " + known);
  }

  console.log(lines.join('\n'));
}

function fileDependents(file) {
  // Rescan: files whose Game.X refs resolve to symbols defined in `file`.
  var fs = require('fs');
  var DEF_RE = /Game\.([A-Za-z_$][\w$]*)\s*=\s*(?:function\s*\(|\{|\[|\d|'|"|`)/g;
  var REF_RE = /Game\.([A-Za-z_$][\w$]*)/g;
  var src = fs.readFileSync(repo.abs(file), 'utf8');
  var defs = {};
  var m;
  while ((m = DEF_RE.exec(src)) !== null) defs[m[1]] = true;
  var out = [];
  repo.listProjectFiles().forEach(function (f) {
    if (f === file || f.slice(-3) !== '.js' || f.indexOf('src/') !== 0) return;
    var other = fs.readFileSync(repo.abs(f), 'utf8');
    var hit = false;
    while ((m = REF_RE.exec(other)) !== null) {
      if (defs[m[1]]) { hit = true; break; }
    }
    if (hit) out.push(f);
  });
  // tests reference module names, not Game symbols — include them by filename.
  repo.listProjectFiles().forEach(function (f) {
    if (f.indexOf('tests/') !== 0) return;
    var testSrc = fs.readFileSync(repo.abs(f), 'utf8');
    var base = file.split('/').pop();
    if (testSrc.indexOf(base) !== -1 || testSrc.indexOf("'" + base.replace('.js', '') + "'") !== -1) {
      if (out.indexOf(f) === -1) out.push(f);
    }
  });
  return out.sort();
}

module.exports = { runImpact: runImpact };
