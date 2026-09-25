'use strict';
/* Load the real src/*.js modules into a vm sandbox — same technique as
   tests/regression.test.js. Returns the Game namespace with UI functions
   stubbed so logic (tick, codec, normalize) can run without a DOM. */

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.resolve(__dirname, '..', '..', '..');

// Must stay in sync with tests/regression.test.js SCRIPT_ORDER.
var SCRIPT_ORDER = ['state', 'buildings', 'resources', 'survivors', 'prestige', 'achievements', 'save', 'ui'];
var WITH_MAIN = SCRIPT_ORDER.concat(['main']);

function loadGame(extras, order) {
  var sandbox = { console: console };
  sandbox.window = sandbox;
  Object.keys(extras || {}).forEach(function (key) { sandbox[key] = extras[key]; });
  vm.createContext(sandbox);
  (order || SCRIPT_ORDER).forEach(function (name) {
    var file = path.join(ROOT, 'src', name + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: 'src/' + name + '.js' });
  });
  var Game = sandbox.Game;
  Game._uiRender = Game.render;
  Game._addLog = Game.addLog;
  Game.render = function () {};
  Game.checkAchievements = function () { return []; };
  Game.addLog = function () {};
  return Game;
}

module.exports = { loadGame: loadGame, SCRIPT_ORDER: SCRIPT_ORDER, WITH_MAIN: WITH_MAIN, ROOT: ROOT };
