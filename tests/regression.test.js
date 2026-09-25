/* =========================================================
   tests/regression.test.js
   外部依存なし(Node標準のみ)の小さな回帰テスト。

   実行方法:
     node tests/regression.test.js

   ゲーム本体と同じ src/*.js を vm 上で読み込み、
   マイルストーン倍率・解放進捗・セーブ互換・artifact同期を検証する。
   ========================================================= */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var SCRIPT_ORDER = ['state', 'buildings', 'resources', 'survivors', 'prestige', 'achievements', 'save', 'ui'];
var ARTIFACT_ORDER = SCRIPT_ORDER.concat(['main']);
var MILESTONES = [
  { count: 10, multiplier: 1.20 },
  { count: 25, multiplier: 1.45 },
  { count: 50, multiplier: 1.90 },
];

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
  Game._uiRender = Game.render; // ui.js の描画関数を保持(テスト用)
  Game._addLog = Game.addLog; // ui.js のログ追加関数を保持(テスト用)
  Game.render = function () {};
  Game.checkAchievements = function () { return []; };
  Game.addLog = function () {};
  return Game;
}

function makeStubElement(id) {
  var element = {
    id: id,
    textContent: '',
    value: '',
    hidden: false,
    disabled: false,
    className: '',
    readOnly: false,
    children: [],
    appendChild: function (child) { element.children.push(child); return child; },
    addEventListener: function () {},
    select: function () {},
  };
  var html = '';
  Object.defineProperty(element, 'innerHTML', {
    get: function () { return html; },
    set: function (value) { html = value; if (value === '') element.children.length = 0; },
  });
  return element;
}

// index.html に存在する要素IDをスタブとして用意する(外部依存なし)
function makeStubDom() {
  var elements = {};
  var listeners = {};
  var indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var re = /id="([^"]+)"/g;
  var match;
  while ((match = re.exec(indexHtml)) !== null) {
    elements[match[1]] = makeStubElement(match[1]);
  }
  return {
    _elements: elements,
    getElementById: function (id) {
      if (!elements[id]) elements[id] = makeStubElement(id);
      return elements[id];
    },
    createElement: function (tag) { return makeStubElement(tag); },
    addEventListener: function (type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    fire: function (type) {
      (listeners[type] || []).forEach(function (handler) { handler(); });
    },
  };
}

var Game = loadGame();
var passed = 0;
var failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok   ' + name);
  } catch (error) {
    failures.push(name);
    console.log('FAIL ' + name);
    console.log('     ' + (error && error.message));
  }
}

function withState(state, fn) {
  var previous = Game.state;
  Game.state = state;
  try {
    fn();
  } finally {
    Game.state = previous;
  }
}

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function collectText(element) {
  var parts = [element.textContent || ''];
  (element.children || []).forEach(function (child) { parts.push(collectText(child)); });
  return parts.join(' ');
}

// ---------- マイルストーン ----------

test('BUILDING_DEFS がマイルストーン定義の正本になっている', function () {
  Game.BUILDING_KEYS.forEach(function (key) {
    var def = Game.BUILDING_DEFS[key];
    assert.ok(def.milestones, key + ' に milestones がない');
    assert.strictEqual(def.milestones.length, MILESTONES.length, key + ' の段階数');
    MILESTONES.forEach(function (expected, index) {
      assert.strictEqual(def.milestones[index].count, expected.count, key + ' の棟数');
      assert.strictEqual(def.milestones[index].multiplier, expected.multiplier, key + ' の倍率');
    });
  });
});

test('9/10/24/25/49/50棟の最終倍率(累積乗算しない)', function () {
  var expected = { 0: 1, 9: 1, 10: 1.20, 24: 1.20, 25: 1.45, 49: 1.45, 50: 1.90, 120: 1.90 };
  Game.BUILDING_KEYS.forEach(function (key) {
    Object.keys(expected).forEach(function (level) {
      var state = Game.createInitialState();
      state.buildings[key] = Number(level);
      assert.strictEqual(
        Game.getBuildingOutputMultiplier(key, state),
        expected[level],
        key + ' ' + level + '棟'
      );
    });
  });
  // 累積乗算(1.20*1.45*1.90=3.306)になっていないこと
  var state = Game.createInitialState();
  state.buildings.woodcutter = 50;
  assert.strictEqual(Game.getBuildingOutputMultiplier('woodcutter', state), 1.90);
});

test('次のマイルストーン(残り棟数)を取得できる', function () {
  var state = Game.createInitialState();
  state.buildings.woodcutter = 7;
  var next = Game.getNextBuildingMilestone('woodcutter', state);
  assert.strictEqual(next.count, 10);
  assert.strictEqual(next.remaining, 3);
  assert.strictEqual(next.multiplier, 1.20);

  state.buildings.woodcutter = 50;
  assert.strictEqual(Game.getNextBuildingMilestone('woodcutter', state), null);
});

// ---------- 未解放プレビュー ----------

test('未解放条件の進捗を建物定義から取得できる', function () {
  var state = Game.createInitialState();
  assert.strictEqual(Game.isBuildingUnlocked(state, 'woodcutter'), true);

  var miner = Game.getUnlockProgress('miner', state);
  assert.strictEqual(miner.done, false);
  assert.strictEqual(miner.current, 0);
  assert.strictEqual(miner.required, 1);
  assert.ok(miner.text.length > 0, '解放条件テキストが空');

  state.buildings.woodcutter = 1;
  assert.strictEqual(Game.isBuildingUnlocked(state, 'miner'), true);

  assert.strictEqual(Game.getUnlockProgress('generator', state).required, 3);
  state.buildings.miner = 2;
  assert.strictEqual(Game.getUnlockProgress('generator', state).done, false);
  state.buildings.miner = 3;
  assert.strictEqual(Game.isBuildingUnlocked(state, 'generator'), true);

  // 分子は required でクランプされる
  state.buildings.miner = 99;
  var clamped = Game.getUnlockProgress('generator', state);
  assert.strictEqual(clamped.current, 3);
  assert.strictEqual(clamped.required, 3);

  state.survivors.total = 1;
  assert.strictEqual(Game.isBuildingUnlocked(state, 'farm'), true);
  state.buildings.generator = 1;
  assert.strictEqual(Game.isBuildingUnlocked(state, 'refinery'), true);
});

test('未解放の建物は購入できない', function () {
  var state = Game.createInitialState();
  state.resources.wood = 100000;
  state.resources.metal = 100000;
  withState(state, function () {
    assert.strictEqual(Game.buyBuilding('refinery'), false);
    assert.strictEqual(state.buildings.refinery, 0);
    assert.strictEqual(Game.buyBuilding('woodcutter'), true);
    assert.strictEqual(state.buildings.woodcutter, 1);
  });
});

// ---------- セーブ互換 ----------

test('旧セーブ(normalizeState)でも undefined が出ない', function () {
  var legacy = { resources: { wood: 5 }, buildings: { woodcutter: 3 } };
  var state = Game.normalizeState(legacy);
  assert.strictEqual(state.buildings.miner, 0);
  assert.ok(state.survivors.assigned, 'survivors.assigned が補完されていない');
  assert.ok(state.prestige.upgrades, 'prestige.upgrades が補完されていない');
  assert.ok(state.achievements, 'achievements が補完されていない');
  assert.ok(state.stats, 'stats が補完されていない');
  assert.strictEqual(Game.getBuildingOutputMultiplier('woodcutter', state), 1);

  withState(state, function () {
    Game.tick(1);
  });
  Object.keys(state.resources).forEach(function (key) {
    assert.ok(!Number.isNaN(state.resources[key]), key + ' が NaN');
  });

  // buildings を欠いた state でも倍率取得で落ちない
  assert.strictEqual(Game.getBuildingOutputMultiplier('woodcutter', {}), 1);
  assert.strictEqual(Game.getBuildingOutputMultiplier('unknown', state), 1);
});

test('prestige 後は建物0で倍率×1に戻る', function () {
  var state = Game.createInitialState();
  Game.BUILDING_KEYS.forEach(function (key) { state.buildings[key] = 50; });
  state.resources.components = Game.ESCAPE_REQUIREMENTS.components;
  state.resources.metal = Game.ESCAPE_REQUIREMENTS.metal;
  withState(state, function () {
    assert.strictEqual(Game.doPrestige(0), true);
  });
  Game.BUILDING_KEYS.forEach(function (key) {
    assert.strictEqual(state.buildings[key], 0, key + ' がリセットされていない');
    assert.strictEqual(Game.getBuildingOutputMultiplier(key, state), 1, key + ' の倍率');
  });
});

// ---------- 生産計算 ----------

test('生産量にマイルストーン倍率が掛かる', function () {
  var state = Game.createInitialState();
  state.buildings.woodcutter = 10;
  state.resources.wood = 0;
  withState(state, function () {
    Game.tick(1);
  });
  assert.ok(
    Math.abs(state.resources.wood - 0.6 * 10 * 1.20) < 1e-9,
    '木材生産=' + state.resources.wood
  );
});

test('消費量にはマイルストーン倍率が掛からない', function () {
  var state = Game.createInitialState();
  state.buildings.generator = 50;
  state.buildings.refinery = 50;
  state.resources.wood = 1000;
  state.resources.metal = 1000;
  withState(state, function () {
    Game.tick(1);
  });

  var info = Game.lastPowerInfo;
  assert.strictEqual(info.ratio, 1, '電力需給比');
  assert.ok(
    Math.abs((1000 - state.resources.wood) - 0.3 * 50) < 1e-9,
    '発電機の木材消費=' + (1000 - state.resources.wood)
  );
  assert.ok(
    Math.abs((1000 - state.resources.metal) - 0.6 * 50) < 1e-9,
    '精製所の金属消費=' + (1000 - state.resources.metal)
  );
  assert.ok(Math.abs(info.supply - 1.2 * 50 * 1.90) < 1e-9, '電力供給=' + info.supply);
  assert.ok(Math.abs(info.demand - 1 * 50) < 1e-9, '電力需要=' + info.demand);
});

test('生産計算とUI表示が同じ倍率関数を参照する', function () {
  var resourcesSrc = fs.readFileSync(path.join(ROOT, 'src/resources.js'), 'utf8');
  var uiSrc = fs.readFileSync(path.join(ROOT, 'src/ui.js'), 'utf8');
  var buildingsSrc = fs.readFileSync(path.join(ROOT, 'src/buildings.js'), 'utf8');
  assert.ok(resourcesSrc.indexOf('Game.getBuildingOutputMultiplier(') !== -1, 'resources.js が共通関数を使っていない');
  assert.ok(uiSrc.indexOf('Game.getBuildingOutputMultiplier(') !== -1, 'ui.js が共通関数を使っていない');
  assert.ok(buildingsSrc.indexOf('Game.getBuildingOutputMultiplier = function') !== -1, '共通関数が定義されていない');
  ['1.20', '1.45', '1.90', '1.25', '1.60', '2.20'].forEach(function (literal) {
    assert.strictEqual(uiSrc.indexOf(literal), -1, 'ui.js に倍率リテラル ' + literal + ' が二重定義されている');
  });
});

// ---------- 次の目標 ----------

test('次の目標の優先順位(解放 → マイルストーン → ジャンプ)', function () {
  var state = Game.createInitialState();
  assert.strictEqual(Game.getNextGoal(state).kind, 'unlock');

  Game.BUILDING_KEYS.forEach(function (key) { state.buildings[key] = 1; });
  state.buildings.miner = 3;
  state.buildings.generator = 1;
  state.survivors.total = 1;
  state.buildings.woodcutter = 9;
  assert.strictEqual(Game.getNextGoal(state).kind, 'milestone');

  state.resources.components = Game.ESCAPE_REQUIREMENTS.components;
  state.resources.metal = Game.ESCAPE_REQUIREMENTS.metal;
  var goal = Game.getNextGoal(state);
  assert.strictEqual(goal.kind, 'jump');
  assert.ok(goal.text.indexOf('知識') !== -1, '予想KPが表示されない: ' + goal.text);
});

// ---------- 描画スモークテスト(DOMスタブ) ----------

test('DOMスタブ上で initUI / render が例外を出さず、未解放行と目標を描画する', function () {
  var dom = makeStubDom();
  var game = loadGame({ document: dom });
  var state = game.createInitialState();
  state.resources.wood = 5000;
  state.resources.metal = 5000;
  state.buildings.woodcutter = 10; // マイルストーン到達
  state.survivors.total = 1;
  game.state = state;
  game.render = game._uiRender; // 実際の描画処理を使う

  game.initUI();
  game.render();

  var rows = dom.getElementById('building-list').children;
  assert.ok(rows.length > 0, '建物行が描画されていない');
  var lockedRows = rows.filter(function (row) {
    return String(row.className).indexOf('locked') !== -1;
  });
  assert.ok(lockedRows.length > 0, '未解放建物の行が描画されていない');

  var lockedText = lockedRows.map(collectText).join(' ');
  assert.ok(lockedText.indexOf('解放条件') !== -1, '解放条件が表示されていない: ' + lockedText);

  var unlockedRow = rows.filter(function (row) {
    return String(row.className).indexOf('locked') === -1;
  })[0];
  var unlockedText = collectText(unlockedRow);
  assert.ok(unlockedText.indexOf('生産 ×1.20') !== -1, 'マイルストーン倍率が表示されていない: ' + unlockedText);

  assert.ok(dom.getElementById('next-goal-text').textContent.length > 0, '次の目標が空');
});

test('main.js の boot が DOM スタブ上で例外を出さない', function () {
  var dom = makeStubDom();
  var game = loadGame({
    document: dom,
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    setInterval: function () { return 1; },
    addEventListener: function () {},
  }, SCRIPT_ORDER.concat(['main']));

  game.addLog = game._addLog;
  game.render = game._uiRender; // boot 内の render を実際の描画処理にする
  dom.fire('DOMContentLoaded');

  assert.ok(game.state, 'state が初期化されていない');
  assert.strictEqual(game.state.buildings.woodcutter, 0);
  assert.ok(game.logMessages.length > 0, '起動ログが出ていない');
  assert.ok(dom.getElementById('next-goal-text').textContent.length > 0, '次の目標が空');
});

// ---------- artifact 同期 ----------

test('artifact/game.html がソース版と同期している', function () {
  var html = fs.readFileSync(path.join(ROOT, 'artifact/game.html'), 'utf8');
  var styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  var scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(styleMatch, 'artifact に <style> がない');
  assert.ok(scriptMatch, 'artifact に <script> がない');

  var css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.strictEqual(normalize(styleMatch[1]), normalize(css), 'CSSが一致しない');

  var js = ARTIFACT_ORDER.map(function (name) {
    var body = fs.readFileSync(path.join(ROOT, 'src', name + '.js'), 'utf8');
    return '/* ---- src/' + name + '.js ---- */ ' + body;
  }).join(' ');
  assert.strictEqual(normalize(scriptMatch[1]), normalize(js), 'JSが一致しない');

  var markup = html.slice(0, html.indexOf('<script>'));
  var indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var ids = function (text) {
    var found = [];
    var re = /id="([^"]+)"/g;
    var match;
    while ((match = re.exec(text)) !== null) found.push(match[1]);
    return found.sort().join(',');
  };
  assert.strictEqual(ids(markup), ids(indexHtml), '要素IDが一致しない');
});

// ---------- 結果 ----------

console.log('');
console.log(passed + ' passed, ' + failures.length + ' failed');
if (failures.length > 0) {
  failures.forEach(function (name) { console.log('  - ' + name); });
  process.exit(1);
}
