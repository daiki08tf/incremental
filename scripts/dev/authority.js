'use strict';

var map = require('./map');

function runAuthority(args) {
  var m = map.getMap();
  var check = args.indexOf('--check') !== -1;
  var query = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];

  if (check) {
    var missing = m.authorities.reduce(function (acc, a) {
      return acc.concat(a.missingPaths.map(function (p) { return a.id + ': ' + p; }));
    }, []);
    if (missing.length === 0) {
      console.log('authority map OK — ' + m.authorities.length + ' authorities, all paths resolve');
      return;
    }
    console.error(missing.length + ' missing path(s):');
    missing.forEach(function (p) { console.error('  ' + p); });
    process.exit(1);
  }

  if (!query) {
    var lines = map.heading('Incremental — authority map');
    m.authorities.forEach(function (a) {
      lines.push((a.id + '                ').slice(0, 16) + ' [' + a.kind + ']  ' + a.title);
      a.authority.slice(0, 3).forEach(function (f) { lines.push('                   ' + f); });
      if (a.authority.length > 3) lines.push('                   +' + (a.authority.length - 3) + ' more');
      if (a.persisted) lines.push('                   saved: ' + a.persisted);
      lines.push('');
    });
    console.log(lines.join('\n'));
    return;
  }

  var auth = map.findAuthority(m, query);
  if (!auth) {
    var known = m.authorities.map(function (a) { return a.id; }).join(', ');
    map.fail("no authority matches '" + query + "' — known: " + known);
  }

  var lines = map.heading('authority: ' + auth.id);
  lines.push(auth.title + '  [' + auth.kind + ']', '');
  if (auth.authority.length) {
    lines.push.apply(lines, map.section('source of truth'));
    auth.authority.forEach(function (f) { lines.push('  ' + f); });
  }
  if (auth.persisted) lines.push.apply(lines, map.section('persisted state').concat('  ' + auth.persisted));
  if (auth.mutation && auth.mutation.length) {
    lines.push.apply(lines, map.section('mutation points'));
    auth.mutation.forEach(function (x) { lines.push('  ' + x); });
  }
  if (auth.missingPaths.length) {
    lines.push.apply(lines, map.section('MISSING PATHS'));
    auth.missingPaths.forEach(function (f) { lines.push('  ' + f); });
  }
  if (auth.systemsTouched.length) {
    lines.push.apply(lines, map.section('systems').concat('  ' + auth.systemsTouched.join(', ')));
  }
  if (auth.relatedTests.length) {
    lines.push.apply(lines, map.section('related tests (' + auth.relatedTests.length + ')'));
    auth.relatedTests.slice(0, 20).forEach(function (t) { lines.push('  ' + t); });
  }
  if (auth.validation) lines.push.apply(lines, map.section('validation').concat('  ' + auth.validation));
  if (auth.notes) lines.push.apply(lines, map.section('invariants / notes').concat('  ' + auth.notes));
  console.log(lines.join('\n'));
}

module.exports = { runAuthority: runAuthority };
