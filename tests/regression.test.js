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
var SCRIPT_ORDER = ['state', 'buildings', 'planets', 'resources', 'survivors', 'prestige', 'achievements', 'save', 'ui'];
var ARTIFACT_ORDER = SCRIPT_ORDER.concat(['main']);
var MILESTONES = [
  { count: 10, multiplier: 1.15 },
  { count: 25, multiplier: 1.33 },
  { count: 50, multiplier: 1.60 },
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
  var expected = { 0: 1, 9: 1, 10: 1.15, 24: 1.15, 25: 1.33, 49: 1.33, 50: 1.60, 120: 1.60 };
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
  // 累積乗算(1.15*1.33*1.60=2.4472)になっていないこと
  var state = Game.createInitialState();
  state.buildings.woodcutter = 50;
  assert.strictEqual(Game.getBuildingOutputMultiplier('woodcutter', state), 1.60);
});

test('次のマイルストーン(残り棟数)を取得できる', function () {
  var state = Game.createInitialState();
  state.buildings.woodcutter = 7;
  var next = Game.getNextBuildingMilestone('woodcutter', state);
  assert.strictEqual(next.count, 10);
  assert.strictEqual(next.remaining, 3);
  assert.strictEqual(next.multiplier, 1.15);

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
    Math.abs(state.resources.wood - 0.6 * 10 * 1.15) < 1e-9,
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
  assert.ok(Math.abs(info.supply - 1.2 * 50 * 1.60) < 1e-9, '電力供給=' + info.supply);
  assert.ok(Math.abs(info.demand - 1 * 50) < 1e-9, '電力需要=' + info.demand);
});

test('生産計算とUI表示が同じ倍率関数を参照する', function () {
  var resourcesSrc = fs.readFileSync(path.join(ROOT, 'src/resources.js'), 'utf8');
  var uiSrc = fs.readFileSync(path.join(ROOT, 'src/ui.js'), 'utf8');
  var buildingsSrc = fs.readFileSync(path.join(ROOT, 'src/buildings.js'), 'utf8');
  assert.ok(resourcesSrc.indexOf('Game.getBuildingOutputMultiplier(') !== -1, 'resources.js が共通関数を使っていない');
  assert.ok(uiSrc.indexOf('Game.getBuildingOutputMultiplier(') !== -1, 'ui.js が共通関数を使っていない');
  assert.ok(buildingsSrc.indexOf('Game.getBuildingOutputMultiplier = function') !== -1, '共通関数が定義されていない');
  // 正本(buildings.js)の倍率が UI に数値で書き写されていないこと
  var forbidden = ['1.20', '1.45', '1.90', '1.25', '2.20']; // 旧倍率も再混入防止として残す
  Game.BUILDING_KEYS.forEach(function (key) {
    Game.BUILDING_DEFS[key].milestones.forEach(function (milestone) {
      forbidden.push(milestone.multiplier.toFixed(2));
    });
  });
  forbidden.forEach(function (literal) {
    assert.strictEqual(uiSrc.indexOf(literal), -1, 'ui.js に倍率リテラル ' + literal + ' が二重定義されている');
  });
});

// ---------- 次の目標 ----------

// 全建物が解放済みで、どの建物もマイルストーン未達の状態を作る
function unlockedState() {
  var state = Game.createInitialState();
  Game.BUILDING_KEYS.forEach(function (key) { state.buildings[key] = 1; });
  state.buildings.miner = 3;
  state.buildings.generator = 1;
  state.survivors.total = 1;
  return state;
}

test('脱出条件の達成度は部品と金属の低い方(ボトルネック)で表される', function () {
  var req = Game.ESCAPE_REQUIREMENTS;
  var state = Game.createInitialState();

  // 部品が半分・金属が充足 → 達成度は部品側の 0.5
  state.resources.components = req.components / 2;
  state.resources.metal = req.metal;
  var progress = Game.getEscapeProgress(state);
  assert.ok(Math.abs(progress.ratio - 0.5) < 1e-9, 'ratio=' + progress.ratio);
  assert.strictEqual(progress.resources.metal.ratio, 1);
  assert.strictEqual(progress.done, false, '片方だけでは達成にならない');

  // 金属が1/4・部品が充足 → 達成度は金属側の 0.25
  state.resources.components = req.components;
  state.resources.metal = req.metal / 4;
  progress = Game.getEscapeProgress(state);
  assert.ok(Math.abs(progress.ratio - 0.25) < 1e-9, 'ratio=' + progress.ratio);

  // 両方充足 → 1.0(過剰でも1で頭打ち)
  state.resources.metal = req.metal;
  progress = Game.getEscapeProgress(state);
  assert.strictEqual(progress.ratio, 1);
  assert.strictEqual(progress.done, true);
  state.resources.components = req.components * 10;
  assert.strictEqual(Game.getEscapeProgress(state).resources.components.ratio, 1);

  // 必要量は正本(ESCAPE_REQUIREMENTS)のみで、UI側に数値が二重定義されていない
  var uiSrc = fs.readFileSync(path.join(ROOT, 'src/ui.js'), 'utf8');
  Object.keys(req).forEach(function (res) {
    assert.strictEqual(uiSrc.indexOf(String(req[res])), -1, 'ui.js に脱出条件 ' + req[res] + ' が二重定義されている');
  });
});

test('未解放建物がある間は解放目標が優先される', function () {
  var state = Game.createInitialState();
  var goal = Game.getNextGoal(state);
  assert.strictEqual(goal.kind, 'unlock');
  assert.ok(goal.text.indexOf('解放') !== -1, '解放目標の文言: ' + goal.text);

  // 全建物が解放済みになると解放目標は出ない
  var unlocked = unlockedState();
  Game.BUILDING_KEYS.forEach(function (key) {
    assert.strictEqual(Game.isBuildingUnlocked(unlocked, key), true, key + ' が未解放のまま');
  });
  assert.notStrictEqual(Game.getNextGoal(unlocked).kind, 'unlock');

  // 指定された優先順位では、ジャンプ可能でも未解放の建物が残っていれば解放目標を出す
  // (生存者を1人も迎え入れないまま部品500・金属800へ到達した場合が該当)
  var jumpableButLocked = unlockedState();
  jumpableButLocked.survivors.total = 0; // 農場だけが未解放のまま
  jumpableButLocked.resources.components = Game.ESCAPE_REQUIREMENTS.components;
  jumpableButLocked.resources.metal = Game.ESCAPE_REQUIREMENTS.metal;
  assert.strictEqual(Game.canPrestige(jumpableButLocked), true, '前提: ジャンプ可能');
  assert.strictEqual(Game.isBuildingUnlocked(jumpableButLocked, 'farm'), false, '前提: 農場が未解放');
  assert.strictEqual(Game.getNextGoal(jumpableButLocked).kind, 'unlock');
});

test('ジャンプ可能時はKP表示が優先される', function () {
  var state = unlockedState();
  state.buildings.woodcutter = 9; // マイルストーン直前(未達)でも
  assert.strictEqual(Game.getNextGoal(state).kind, 'milestone', '前提: 通常はマイルストーンが出る');

  state.resources.components = Game.ESCAPE_REQUIREMENTS.components;
  state.resources.metal = Game.ESCAPE_REQUIREMENTS.metal;
  var goal = Game.getNextGoal(state);
  assert.strictEqual(goal.kind, 'jump');
  assert.ok(goal.text.indexOf('知識') !== -1, '予想KPが表示されない: ' + goal.text);
  assert.ok(goal.text.indexOf('KP') !== -1, 'KP表記がない: ' + goal.text);
});

test('次の目標はマイルストーンと脱出条件の達成度を比べて近い方を出す', function () {
  var req = Game.ESCAPE_REQUIREMENTS;

  // 伐採小屋9/10棟(達成度0.90) > 脱出条件(0.00) → マイルストーン
  var state = unlockedState();
  state.buildings.woodcutter = 9;
  var goal = Game.getNextGoal(state);
  assert.strictEqual(goal.kind, 'milestone', '文言: ' + goal.text);
  assert.ok(goal.text.indexOf('10棟') !== -1, '文言: ' + goal.text);

  // 脱出条件(部品0.92・金属0.95 → 0.92) > マイルストーン(0.90) → 脱出条件が選ばれる
  state.resources.components = req.components * 0.92;
  state.resources.metal = req.metal * 0.95;
  goal = Game.getNextGoal(state);
  assert.strictEqual(goal.kind, 'escape', '文言: ' + goal.text);
  assert.ok(goal.text.indexOf('部品') !== -1 && goal.text.indexOf('金属') !== -1, '文言: ' + goal.text);
  assert.ok(Math.abs(goal.ratio - 0.92) < 1e-9, 'goal.ratio=' + goal.ratio);

  // 金属側が遅れれば、そちらの低い方の値が達成度になる
  state.resources.components = req.components * 0.99;
  state.resources.metal = req.metal * 0.5;
  goal = Game.getNextGoal(state);
  assert.strictEqual(goal.kind, 'milestone', '金属が遅れているのでマイルストーン(0.90)が近い: ' + goal.text);

  // マイルストーンを全達成すると脱出条件だけが残る
  var late = unlockedState();
  Game.BUILDING_KEYS.forEach(function (key) { late.buildings[key] = 50; });
  late.resources.metal = req.metal * 0.8;
  late.resources.components = 0;
  assert.strictEqual(Game.getNextGoal(late).kind, 'escape');
});

// ---------- 惑星環境モディファイア(Candidate B) ----------

function planetState(prestigeCount) {
  var state = Game.createInitialState();
  state.prestige.count = prestigeCount;
  return state;
}

test('prestige count から現在惑星を導出する(0=標準 / 1..4で循環)', function () {
  var expected = { 0: '標準環境', 1: '鉱脈惑星', 2: '森林惑星', 3: '腐食惑星', 4: '工業遺構惑星', 5: '鉱脈惑星' };
  Object.keys(expected).forEach(function (count) {
    var state = planetState(Number(count));
    assert.strictEqual(Game.getCurrentPlanet(state).name, expected[count], 'count=' + count);
  });
  // 2周目以降も同じ周期で回る(5→1, 8→4, 9→1)
  assert.strictEqual(Game.getCurrentPlanet(planetState(8)).name, '工業遺構惑星');
  assert.strictEqual(Game.getCurrentPlanet(planetState(9)).name, '鉱脈惑星');
  assert.strictEqual(Game.getCurrentPlanet(planetState(13)).name, '鉱脈惑星');
});

test('次の惑星を事前に取得できる', function () {
  assert.strictEqual(Game.getNextPlanet(planetState(0)).name, '鉱脈惑星');
  assert.strictEqual(Game.getNextPlanet(planetState(1)).name, '森林惑星');
  assert.strictEqual(Game.getNextPlanet(planetState(4)).name, '鉱脈惑星');
});

test('標準以外の惑星は「得る資源」と「不得意な資源」を両方持つ(全面buff/nerfでない)', function () {
  var penaltyResources = [];
  Game.PLANET_DEFS.slice(1).forEach(function (planet) {
    var mods = planet.modifiers;
    var boosted = Object.keys(mods).filter(function (res) { return mods[res] > 1; });
    var penalized = Object.keys(mods).filter(function (res) { return mods[res] < 1; });
    assert.ok(boosted.length >= 1, planet.name + ' に得な資源がない');
    assert.ok(penalized.length >= 1, planet.name + ' に不得意な資源がない');
    penalized.forEach(function (res) { penaltyResources.push(res); });
  });
  // 各惑星の「不得意な資源」は重複しない(=惑星ごとに違う弱点を持つ)
  var unique = penaltyResources.filter(function (res, index) {
    return penaltyResources.indexOf(res) === index;
  });
  assert.strictEqual(unique.length, penaltyResources.length, '弱点が重複: ' + penaltyResources.join(','));
});

test('第1周(prestige 0)は標準惑星で全資源×1.00(初回ジャンプ時間を変えない)', function () {
  var state = Game.createInitialState();
  assert.strictEqual(Game.getCurrentPlanet(state).name, '標準環境');
  Game.RESOURCE_KEYS.forEach(function (res) {
    assert.strictEqual(Game.getPlanetResourceMultiplier(state, res), 1, res + ' の倍率');
  });
  // Candidate A と同じ生産量(素の出力 × マイルストーン)から変化しない
  state.buildings.woodcutter = 10;
  withState(state, function () { Game.tick(1); });
  assert.ok(
    Math.abs(state.resources.wood - 0.6 * 10 * 1.15) < 1e-9,
    '木材生産=' + state.resources.wood
  );
});

test('正の生産に惑星倍率が掛かる(鉱脈惑星: 金属+18% / 木材-10%)', function () {
  var ore = planetState(1);
  ore.buildings.miner = 10; // マイルストーン×1.15 と併用
  withState(ore, function () { Game.tick(1); });
  assert.ok(
    Math.abs(ore.resources.metal - 0.35 * 10 * 1.15 * 1.18) < 1e-9,
    '金属生産=' + ore.resources.metal
  );

  var forest = planetState(1);
  forest.buildings.woodcutter = 10;
  withState(forest, function () { Game.tick(1); });
  assert.ok(
    Math.abs(forest.resources.wood - 0.6 * 10 * 1.15 * 0.90) < 1e-9,
    '木材生産=' + forest.resources.wood
  );

  // 定義にない資源・state が欠けた場合は ×1.00
  assert.strictEqual(Game.getPlanetResourceMultiplier(ore, 'unknown'), 1);
  assert.strictEqual(Game.getPlanetResourceMultiplier({}, 'metal'), 1);

  // 森林惑星(prestige 2): 木材 ×1.25
  var forest = planetState(2);
  forest.buildings.woodcutter = 10;
  withState(forest, function () { Game.tick(1); });
  assert.ok(
    Math.abs(forest.resources.wood - 0.6 * 10 * 1.15 * 1.25) < 1e-9,
    '森林惑星の木材=' + forest.resources.wood
  );

  // 腐食惑星(prestige 3): 部品 ×0.85(生産のみ。精製所の金属消費は素のまま)
  var corroded = planetState(3);
  corroded.buildings.generator = 1;
  corroded.buildings.refinery = 1;
  corroded.resources.metal = 100;
  withState(corroded, function () { Game.tick(1); });
  assert.ok(
    Math.abs(corroded.resources.components - 0.15 * 0.85) < 1e-9,
    '腐食惑星の部品=' + corroded.resources.components
  );
  assert.ok(
    Math.abs((100 - corroded.resources.metal) - 0.6) < 1e-9,
    '腐食惑星の金属消費=' + (100 - corroded.resources.metal)
  );
});

test('消費量には惑星倍率が掛からない', function () {
  // 鉱脈惑星(metal×1.18 / wood×0.90)でも消費側は素の値のまま
  // (電力需給を成立させるため発電機を1棟置く。これが無いと精製所は停止する)
  var ore = planetState(1);
  ore.buildings.generator = 1;
  ore.buildings.refinery = 1;
  ore.resources.wood = 100;
  ore.resources.metal = 100;
  withState(ore, function () { Game.tick(1); });
  assert.ok(Math.abs((100 - ore.resources.metal) - 0.6) < 1e-9, '金属消費=' + (100 - ore.resources.metal));
  assert.ok(Math.abs((100 - ore.resources.wood) - 0.3) < 1e-9, '木材消費=' + (100 - ore.resources.wood));
  assert.ok(Math.abs(Game.lastPowerInfo.demand - 1) < 1e-9, '電力需要=' + Game.lastPowerInfo.demand);

  // 発電機の木材消費も惑星倍率の影響を受けない(工業遺構惑星でも 0.3/s のまま)
  var industrial = planetState(4);
  industrial.buildings.generator = 1;
  industrial.resources.wood = 100;
  withState(industrial, function () { Game.tick(1); });
  assert.ok(Math.abs((100 - industrial.resources.wood) - 0.3) < 1e-9, '木材消費=' + (100 - industrial.resources.wood));

  // 電力需要は素の 1/s、供給だけが ×0.90 される
  var industrialFactory = planetState(4);
  industrialFactory.buildings.generator = 1;
  industrialFactory.buildings.refinery = 1;
  withState(industrialFactory, function () { Game.tick(1); });
  assert.ok(Math.abs(Game.lastPowerInfo.supply - 1.2 * 0.90) < 1e-9, '電力供給=' + Game.lastPowerInfo.supply);
  assert.ok(Math.abs(Game.lastPowerInfo.demand - 1) < 1e-9, '電力需要=' + Game.lastPowerInfo.demand);
});

test('手動クリックには惑星倍率が掛からない', function () {
  var ore = planetState(1); // 木材には -10% が乗る惑星
  withState(ore, function () {
    assert.strictEqual(Game.getClickAmount(), 1, 'クリック量');
    Game.doManualClick();
  });
  assert.strictEqual(ore.resources.wood, 1, 'クリックで得た木材=' + ore.resources.wood);
});

test('建物マイルストーン倍率と惑星倍率が積で併用される', function () {
  var ore = planetState(1);
  ore.buildings.miner = 25; // ×1.33
  withState(ore, function () { Game.tick(1); });

  var standard = Game.createInitialState();
  standard.buildings.miner = 25;
  withState(standard, function () { Game.tick(1); });

  assert.ok(
    Math.abs(ore.resources.metal - 0.35 * 25 * 1.33 * 1.18) < 1e-9,
    '金属生産=' + ore.resources.metal
  );
  // 惑星倍率だけが比として掛かる(加算でも二重適用でもない)
  assert.ok(
    Math.abs(ore.resources.metal / standard.resources.metal - 1.18) < 1e-9,
    '比=' + (ore.resources.metal / standard.resources.metal)
  );
});

test('旧セーブ(prestige 欠落)でも惑星は標準として動く', function () {
  var state = Game.normalizeState({ resources: { wood: 5 }, buildings: { woodcutter: 3 } });
  assert.strictEqual(state.prestige.count, 0);
  assert.strictEqual(Game.getCurrentPlanet(state).name, '標準環境');
  Game.RESOURCE_KEYS.forEach(function (res) {
    assert.strictEqual(Game.getPlanetResourceMultiplier(state, res), 1, res + ' の倍率');
  });
  withState(state, function () { Game.tick(1); });
  assert.ok(!Number.isNaN(state.resources.wood), '木材が NaN');
});

test('state に惑星フィールドを保存しない(セーブコードでも prestige count から再現)', function () {
  var state = planetState(3);
  assert.strictEqual('planet' in state, false, 'state.planet が存在する');
  var restored = Game.decodeSaveCode(Game.encodeSaveCode(state));
  assert.strictEqual(restored.prestige.count, 3);
  assert.strictEqual(Game.getCurrentPlanet(restored).name, '腐食惑星');
  Game.RESOURCE_KEYS.forEach(function (res) {
    assert.strictEqual(
      Game.getPlanetResourceMultiplier(restored, res),
      Game.getPlanetResourceMultiplier(state, res),
      res + ' の倍率'
    );
  });
});

test('prestige 後に次の惑星へ切り替わり、到着ログに惑星名と環境効果が出る', function () {
  var state = Game.createInitialState();
  assert.strictEqual(Game.getCurrentPlanet(state).name, '標準環境');
  state.resources.components = Game.ESCAPE_REQUIREMENTS.components;
  state.resources.metal = Game.ESCAPE_REQUIREMENTS.metal;

  var logs = [];
  var originalAddLog = Game.addLog;
  Game.addLog = function (message) { logs.push(message); };
  try {
    withState(state, function () {
      assert.strictEqual(Game.doPrestige(0), true);
    });
  } finally {
    Game.addLog = originalAddLog;
  }

  assert.strictEqual(state.prestige.count, 1);
  assert.strictEqual(Game.getCurrentPlanet(state).name, '鉱脈惑星');
  assert.strictEqual(Game.getNextPlanet(state).name, '森林惑星');
  assert.strictEqual(logs.length, 1, 'ログ件数=' + logs.length);
  assert.ok(logs[0].indexOf('鉱脈惑星') !== -1, '惑星名がログにない: ' + logs[0]);
  assert.ok(logs[0].indexOf('金属生産 +18%') !== -1, '環境効果がログにない: ' + logs[0]);
  assert.ok(logs[0].indexOf('木材生産 -10%') !== -1, '環境効果がログにない: ' + logs[0]);
});

test('生産計算とUIが同じ惑星倍率関数を参照する', function () {
  var resourcesSrc = fs.readFileSync(path.join(ROOT, 'src/resources.js'), 'utf8');
  var uiSrc = fs.readFileSync(path.join(ROOT, 'src/ui.js'), 'utf8');
  var planetsSrc = fs.readFileSync(path.join(ROOT, 'src/planets.js'), 'utf8');
  assert.ok(resourcesSrc.indexOf('Game.getPlanetResourceMultiplier(') !== -1, 'resources.js が共通関数を使っていない');
  assert.ok(uiSrc.indexOf('Game.getPlanetResourceMultiplier(') !== -1, 'ui.js が共通関数を使っていない');
  assert.ok(planetsSrc.indexOf('Game.getPlanetResourceMultiplier = function') !== -1, '共通関数が定義されていない');
  // 正本(planets.js)の倍率が UI に数値で書き写されていないこと
  Game.PLANET_DEFS.forEach(function (planet) {
    Object.keys(planet.modifiers).forEach(function (res) {
      var multiplier = planet.modifiers[res];
      if (multiplier === 1) return;
      assert.strictEqual(
        uiSrc.indexOf(multiplier.toFixed(2)), -1,
        'ui.js に惑星倍率リテラル ' + multiplier.toFixed(2) + ' が二重定義されている'
      );
    });
  });
});

test('UIが現在惑星とジャンプ可能時の次の惑星を表示する', function () {
  var dom = makeStubDom();
  var game = loadGame({ document: dom });
  var state = game.createInitialState();
  state.prestige.count = 1;
  game.state = state;
  game.render = game._uiRender;
  game.initUI();
  game.render();

  var current = dom.getElementById('planet-current').textContent;
  assert.ok(current.indexOf('鉱脈惑星') !== -1, '現在惑星が出ていない: ' + current);
  assert.ok(current.indexOf('金属 +18%') !== -1, '環境効果が出ていない: ' + current);
  assert.strictEqual(dom.getElementById('planet-count').textContent, '第2惑星');
  // ジャンプ不可のうちは次の惑星を出さない
  assert.strictEqual(dom.getElementById('planet-next').textContent, '');

  state.resources.components = game.ESCAPE_REQUIREMENTS.components;
  state.resources.metal = game.ESCAPE_REQUIREMENTS.metal;
  game.render();
  var next = dom.getElementById('planet-next').textContent;
  assert.ok(next.indexOf('森林惑星') !== -1, '次の惑星が出ていない: ' + next);
  assert.ok(next.indexOf('木材 +25%') !== -1, '次の惑星の効果が出ていない: ' + next);
  assert.ok(next.indexOf('金属 -15%') !== -1, '次の惑星の効果が出ていない: ' + next);
});

test('index.html の script 読み込み順が正本と一致する', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var order = [];
  var re = /<script src="src\/([a-z]+)\.js"><\/script>/g;
  var match;
  while ((match = re.exec(html)) !== null) order.push(match[1]);
  assert.strictEqual(order.join(','), ARTIFACT_ORDER.join(','));
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
  assert.ok(unlockedText.indexOf('生産 ×1.15') !== -1, 'マイルストーン倍率が表示されていない: ' + unlockedText);

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
