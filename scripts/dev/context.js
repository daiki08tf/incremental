'use strict';

var map = require('./map');

function runContext(args) {
  var target = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];
  if (!target) map.fail('usage: ./dev context <system|authority|concept>');

  var m = map.getMap();
  var system = map.findSystem(m, target);
  var authority = map.findAuthority(m, target);
  if (!system && !authority) {
    var known = m.systems.map(function (s) { return s.id; }).concat(m.authorities.map(function (a) { return a.id; })).join(', ');
    map.fail("unknown target '" + target + "'\n  known: " + known);
  }

  var lines = map.heading('context: ' + target);

  if (authority) {
    lines.push('AUTHORITY — ' + authority.title + '  [' + authority.kind + ']', '');
    lines.push.apply(lines, map.section('source of truth'));
    authority.authority.forEach(function (f) { lines.push('  ' + f); });
    if (authority.persisted) lines.push.apply(lines, map.section('persisted state / save implications').concat('  ' + authority.persisted));
    if (authority.mutation && authority.mutation.length) {
      lines.push.apply(lines, map.section('mutation points'));
      authority.mutation.forEach(function (x) { lines.push('  ' + x); });
    }
    if (authority.notes) lines.push.apply(lines, map.section('known constraints / invariants').concat('  ' + authority.notes));
    if (authority.validation) lines.push.apply(lines, map.section('validation').concat('  ' + authority.validation));
  }

  if (system) {
    lines.push('SYSTEM — ' + system.id + ': ' + system.title, '');
    if (system.concepts.length) lines.push('  concepts: ' + system.concepts.join(', '));
    if (system.dependsOn.length) lines.push('  depends on: ' + system.dependsOn.join(', '));
    if (system.dependents.length) lines.push('  depended on by: ' + system.dependents.join(', '));
    lines.push.apply(lines, map.section('key files (' + system.files.length + ')'));
    system.files.slice(0, 30).forEach(function (f) { lines.push('  ' + f); });
    if (system.tests.length) {
      lines.push.apply(lines, map.section('relevant tests (' + system.tests.length + ')'));
      system.tests.forEach(function (t) { lines.push('  ' + t); });
    }
    if (system.docs.length) {
      lines.push.apply(lines, map.section('docs to read first'));
      system.docs.forEach(function (d) { lines.push('  ' + d); });
    }
    var auths = m.authorities.filter(function (a) { return a.systemsTouched.indexOf(system.id) !== -1; });
    if (auths.length) {
      lines.push.apply(lines, map.section('authorities owning files in this system'));
      auths.forEach(function (a) {
        lines.push('  ' + a.id + ' — ' + a.title + (a.persisted ? ' (saved: ' + a.persisted + ')' : ''));
      });
    }
  }

  lines.push.apply(lines, map.section('next steps').concat([
    '  ./dev authority <id>    — full invariants',
    '  ./dev impact <id>       — blast radius',
    '  ./dev save-check        — if save shape touched',
    '  ./dev smoke             — quick sanity after edits',
    '  node tests/regression.test.js — full regression (<1s)',
  ]));
  console.log(lines.join('\n'));
}

module.exports = { runContext: runContext };
