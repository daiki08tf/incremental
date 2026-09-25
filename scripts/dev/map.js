'use strict';
/* Project map: systems x files x tests x Game-namespace dependency graph.
   Unlike ES-module repos, Incremental wires modules through the shared
   `Game` global — so dependencies are derived from which `Game.X` symbols
   each file DEFINES vs REFERENCES. */

var fs = require('fs');
var path = require('path');
var repo = require('./lib/repo');

var SYSTEMS_PATH = '.dev/systems.json';
var AUTHORITY_PATH = '.dev/authority-map.json';
var MAP_PATH = '.dev/project-map.json';
var CODE_RE = /\.js$/;

function heading(title) { return ['=== ' + title + ' ===', '']; }
function section(title) { return ['', '--- ' + title + ' ---']; }
function fail(msg) { console.error(msg); process.exit(1); }

function loadSystems() { return (repo.readJsonFile(SYSTEMS_PATH) || {}).systems || []; }
function loadAuthorities() { return (repo.readJsonFile(AUTHORITY_PATH) || {}).authorities || []; }

function matchesPrefix(file, prefix) {
  if (prefix.slice(-1) === '/') return file.indexOf(prefix) === 0;
  if (prefix.indexOf('*.') === 0) return file.slice(-(prefix.length - 1)) === prefix.slice(1);
  return file.indexOf(prefix) === 0;
}

function bucketFor(file, systems) {
  for (var i = 0; i < systems.length; i++) {
    var paths = systems[i].paths || [];
    for (var j = 0; j < paths.length; j++) {
      if (matchesPrefix(file, paths[j])) return systems[i].id;
    }
  }
  return 'unmapped';
}

function isTestFile(file) { return file.indexOf('tests/') === 0; }
function dedupe(values) {
  var seen = {};
  var out = [];
  values.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
  return out.sort();
}

// --- Game-namespace dependency graph ----------------------------------------

// A "definition" is Game.X = <function|object|array|literal>. Assignments of a
// computed value (Game.state = loaded, Game.lastRates = rates) are shared-slot
// writes, not API definitions — counting them would make every file that reads
// Game.state a dependent of wherever it happens to be written.
var DEF_RE = /Game\.([A-Za-z_$][\w$]*)\s*=\s*(?:function\s*\(|\{|\[|\d|'|"|`)/g;
var REF_RE = /Game\.([A-Za-z_$][\w$]*)/g;

function scanFile(file) {
  var src = fs.readFileSync(repo.abs(file), 'utf8');
  var defs = {};
  var refs = {};
  var m;
  while ((m = DEF_RE.exec(src)) !== null) defs[m[1]] = true;
  while ((m = REF_RE.exec(src)) !== null) refs[m[1]] = true;
  return { defs: Object.keys(defs), refs: Object.keys(refs) };
}

function gameGraph(codeFiles) {
  // symbol -> owning file (first definer wins; collisions are data, not error)
  var owners = {};
  var scans = {};
  codeFiles.forEach(function (file) {
    var scan;
    try {
      scan = scanFile(file);
    } catch (e) {
      return;
    }
    scans[file] = scan;
    scan.defs.forEach(function (sym) {
      if (!owners[sym]) owners[sym] = file;
    });
  });
  // file -> files it depends on (references symbols owned elsewhere)
  var depends = {};
  var dependents = {};
  codeFiles.forEach(function (file) {
    var scan = scans[file] || { refs: [] };
    var deps = {};
    scan.refs.forEach(function (sym) {
      var owner = owners[sym];
      if (owner && owner !== file) deps[owner] = true;
    });
    depends[file] = Object.keys(deps).sort();
    depends[file].forEach(function (dep) {
      if (!dependents[dep]) dependents[dep] = [];
      dependents[dep].push(file);
    });
  });
  return { owners: owners, scans: scans, depends: depends, dependents: dependents };
}

// ----------------------------------------------------------------------------

function buildProjectMap() {
  var systems = loadSystems();
  var authorities = loadAuthorities();
  var allFiles = repo.listProjectFiles();
  var codeFiles = allFiles.filter(function (f) { return CODE_RE.test(f); });
  var testFiles = allFiles.filter(isTestFile);
  var graph = gameGraph(codeFiles.filter(function (f) { return f.indexOf('src/') === 0; }));

  var systemFiles = {};
  var fileSystem = {};
  var unmappedFiles = [];
  allFiles.forEach(function (file) {
    var id = bucketFor(file, systems);
    fileSystem[file] = id;
    if (id === 'unmapped') {
      unmappedFiles.push(file);
    } else {
      if (!systemFiles[id]) systemFiles[id] = [];
      systemFiles[id].push(file);
    }
  });

  var resultSystems = systems.map(function (system) {
    var id = system.id;
    var files = (systemFiles[id] || []).sort();
    var deps = {};
    var dependents = {};
    files.forEach(function (file) {
      (graph.depends[file] || []).forEach(function (target) {
        var targetSystem = fileSystem[target];
        if (targetSystem && targetSystem !== id && targetSystem !== 'unmapped') deps[targetSystem] = true;
      });
      (graph.dependents[file] || []).forEach(function (source) {
        var sourceSystem = fileSystem[source];
        if (sourceSystem && sourceSystem !== id && sourceSystem !== 'unmapped') dependents[sourceSystem] = true;
      });
    });
    // Related tests: test files that name this system's files (the suite
    // loads src modules by name) or that live in tests/ for the 'tests' id.
    var tests = [];
    if (id === 'tests') {
      tests = files.filter(isTestFile);
    } else {
      var basenames = files.map(function (f) { return path.basename(f, '.js'); });
      testFiles.forEach(function (test) {
        var src;
        try {
          src = fs.readFileSync(repo.abs(test), 'utf8');
        } catch (e) {
          return;
        }
        if (files.some(function (f) { return src.indexOf(f) !== -1; }) ||
            basenames.some(function (b) { return b && src.indexOf("'" + b + "'") !== -1 || src.indexOf(b + '.js') !== -1; })) {
          tests.push(test);
        }
      });
    }
    return {
      id: id,
      title: system.title,
      concepts: system.concepts || [],
      files: files,
      tests: dedupe(tests),
      docs: system.docs || [],
      dependsOn: Object.keys(deps).sort(),
      dependents: Object.keys(dependents).sort(),
    };
  });

  var resultAuthorities = authorities.map(function (auth) {
    var authorityPaths = dedupe(auth.authority || []);
    var resolvedFiles = [];
    var missingPaths = [];
    authorityPaths.forEach(function (p) {
      if (repo.pathExists(p)) resolvedFiles.push(p);
      else missingPaths.push(p);
    });
    var systemsTouched = dedupe(resolvedFiles.map(function (f) { return fileSystem[f]; }));
    var relatedTests = [];
    resolvedFiles.forEach(function (file) {
      var sys = resultSystems.find(function (s) { return s.id === fileSystem[file]; });
      if (sys) relatedTests = relatedTests.concat(sys.tests);
    });
    return {
      id: auth.id,
      title: auth.title,
      kind: auth.kind || 'code',
      authority: authorityPaths,
      persisted: auth.persisted,
      mutation: auth.mutation || [],
      validation: auth.validation,
      notes: auth.notes,
      resolvedFiles: resolvedFiles,
      missingPaths: missingPaths,
      systemsTouched: systemsTouched,
      relatedTests: dedupe(relatedTests),
    };
  });

  // Script-order surfaces: index.html <script src> tags vs test harness order.
  var scriptOrder = readScriptOrder();

  return {
    meta: {
      schemaVersion: 1,
      generator: 'scripts/dev/map.js',
      git: { branch: repo.gitBranch(), head: repo.gitHead(), remote: repo.gitRemote() },
      fileCounts: { total: allFiles.length, code: codeFiles.length, tests: testFiles.length },
    },
    systems: resultSystems,
    authorities: resultAuthorities,
    scriptOrder: scriptOrder,
    unmappedFiles: unmappedFiles,
  };
}

function readScriptOrder() {
  var indexOrder = [];
  if (repo.pathExists('index.html')) {
    var html = fs.readFileSync(repo.abs('index.html'), 'utf8');
    var re = /<script src="(src\/[^"]+)"/g;
    var m;
    while ((m = re.exec(html)) !== null) indexOrder.push(m[1]);
  }
  var testOrder = [];
  var testFile = 'tests/regression.test.js';
  if (repo.pathExists(testFile)) {
    var src = fs.readFileSync(repo.abs(testFile), 'utf8');
    var orderMatch = src.match(/SCRIPT_ORDER\s*=\s*\[([^\]]+)\]/);
    if (orderMatch) {
      testOrder = orderMatch[1].split(',').map(function (s) { return 'src/' + s.trim().replace(/['"]/g, '') + '.js'; });
    }
    var mainMatch = src.match(/ARTIFACT_ORDER\s*=\s*SCRIPT_ORDER\.concat\(\['main'\]\)/);
    if (mainMatch) testOrder.push('src/main.js');
  }
  var indexBase = indexOrder;
  var testBase = testOrder;
  return {
    indexHtml: indexBase,
    testHarness: testBase,
    consistent: JSON.stringify(indexBase) === JSON.stringify(testBase),
  };
}

function serializeMap(map) {
  return JSON.stringify(map, null, 2) + '\n';
}

function readProjectMap() { return repo.readJsonFile(MAP_PATH); }

function writeProjectMap(map) {
  var full = repo.abs(MAP_PATH);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, serializeMap(map));
}

function getMap() { return readProjectMap() || buildProjectMap(); }

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (k) {
      return JSON.stringify(k) + ':' + canonicalJson(value[k]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function mapIsFresh() {
  var stored = readProjectMap();
  if (!stored) return { fresh: false, reason: 'missing' };
  var built = buildProjectMap();
  var stripGit = function (m) {
    var copy = JSON.parse(JSON.stringify(m));
    copy.meta.git = null;
    return canonicalJson(copy);
  };
  var equal = stripGit(stored) === stripGit(built);
  return { fresh: equal, reason: equal ? null : 'stale' };
}

function findSystem(map, query) {
  var q = query.toLowerCase();
  return (map.systems || []).find(function (s) {
    return s.id === q || (s.concepts || []).indexOf(q) !== -1 || (s.title || '').toLowerCase().indexOf(q) !== -1;
  });
}

function findAuthority(map, query) {
  var q = query.toLowerCase();
  return (map.authorities || []).find(function (a) {
    return a.id === q || (a.title || '').toLowerCase().indexOf(q) !== -1;
  });
}

function classifyFile(file) {
  var p = file.replace(/^\.\//, '');
  if (p === 'src/state.js' || p === 'src/save.js') return 'save';
  if (p.indexOf('tests/') === 0) return 'tests';
  if (p.indexOf('scripts/dev/') === 0 || p.indexOf('.dev/') === 0 || p === 'dev') return 'devtools';
  if (p.indexOf('scripts/') === 0) return 'scripts';
  if (p.slice(-3) === '.md' || p.indexOf('docs/') === 0) return 'docs';
  if (p.indexOf('artifact/') === 0) return 'generated';
  if (p.indexOf('src/') === 0) return 'src';
  if (p === 'index.html' || p === 'style.css') return 'shell';
  return 'other';
}

function runMap(args) {
  var map = getMap();
  if (args.indexOf('--write') !== -1) {
    writeProjectMap(buildProjectMap());
    console.log('wrote ' + MAP_PATH);
    return;
  }
  if (args.indexOf('--check') !== -1) {
    var res = mapIsFresh();
    if (res.fresh) {
      console.log('project-map.json is fresh');
      return;
    }
    console.log('project-map.json is ' + res.reason + ' — regenerate with ./dev map --write');
    process.exit(1);
  }
  var lines = heading('Incremental — project map');
  var git = map.meta.git;
  lines.push('branch ' + git.branch + '  head ' + git.head + '  files ' + map.meta.fileCounts.total +
    ' (code ' + map.meta.fileCounts.code + ', tests ' + map.meta.fileCounts.tests + ')', '');
  lines.push('systems:');
  map.systems.forEach(function (s) {
    lines.push('  ' + (s.id + '              ').slice(0, 14) + ' ' +
      ('   ' + s.files.length).slice(-4) + ' files  ' + ('   ' + s.tests.length).slice(-3) + ' tests' +
      (s.dependsOn.length ? '  needs: ' + s.dependsOn.join(', ') : ''));
  });
  lines.push('', 'authorities:');
  map.authorities.forEach(function (a) {
    lines.push('  ' + (a.id + '              ').slice(0, 14) + ' [' + a.kind + '] ' + a.title);
  });
  lines.push('', 'script order: ' + (map.scriptOrder.consistent ? 'index.html == test harness OK' : 'MISMATCH index.html vs test harness'));
  if (map.unmappedFiles.length) {
    lines.push('', 'unmapped files: ' + map.unmappedFiles.length);
    map.unmappedFiles.slice(0, 20).forEach(function (f) { lines.push('  ' + f); });
  }
  var res2 = mapIsFresh();
  lines.push('', 'map file: ' + (fs.existsSync(repo.abs(MAP_PATH))
    ? (res2.fresh ? 'fresh' : 'STALE — run ./dev map --write')
    : 'not generated yet (run ./dev map --write)'));
  console.log(lines.join('\n'));
}

module.exports = {
  SYSTEMS_PATH: SYSTEMS_PATH,
  AUTHORITY_PATH: AUTHORITY_PATH,
  MAP_PATH: MAP_PATH,
  loadSystems: loadSystems,
  loadAuthorities: loadAuthorities,
  buildProjectMap: buildProjectMap,
  readProjectMap: readProjectMap,
  writeProjectMap: writeProjectMap,
  getMap: getMap,
  mapIsFresh: mapIsFresh,
  findSystem: findSystem,
  findAuthority: findAuthority,
  classifyFile: classifyFile,
  runMap: runMap,
  heading: heading,
  section: section,
  fail: fail,
};
