'use strict';
/* Shared helpers for ./dev — paths, file inventory, git state.
   CommonJS + `var` to match the repo's existing style. */

var execSync = require('child_process').execSync;
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..', '..');
var IGNORED_DIRS = { '.git': 1, 'node_modules': 1, 'dist': 1, 'coverage': 1 };

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }
function abs(p) { return path.resolve(ROOT, p); }
function pathExists(p) { return fs.existsSync(abs(p)); }

function readJsonFile(p) {
  var file = abs(p);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listFilesRecursive(dir) {
  var out = [];
  var entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  entries.sort(function (a, b) { return a.name.localeCompare(b.name); });
  entries.forEach(function (entry) {
    if (entry.name.charAt(0) === '.') return;
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS[entry.name]) return;
      out = out.concat(listFilesRecursive(full));
    } else if (entry.isFile()) {
      out.push(rel(full));
    }
  });
  return out;
}

function listProjectFiles() { return listFilesRecursive(ROOT); }

function git(args) {
  try {
    return execSync('git -C "' + ROOT + '" ' + args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return null;
  }
}

function gitHead() { return git('rev-parse --short HEAD') || 'unknown'; }
function gitBranch() { return git('rev-parse --abbrev-ref HEAD') || 'unknown'; }
function gitRemote() { return git('remote get-url origin'); }
function gitStatus() {
  var raw = git('status --porcelain');
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(function (line) {
    return { state: line.slice(0, 2), path: line.slice(3).replace(/^"(.*)"$/, '$1') };
  });
}

module.exports = {
  ROOT: ROOT,
  rel: rel,
  abs: abs,
  pathExists: pathExists,
  readJsonFile: readJsonFile,
  listProjectFiles: listProjectFiles,
  gitHead: gitHead,
  gitBranch: gitBranch,
  gitRemote: gitRemote,
  gitStatus: gitStatus,
};
