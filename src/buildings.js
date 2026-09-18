/* =========================================================
   buildings.js
   建物の定義、コスト計算、購入処理、
   マイルストーンと解放条件の正本。

   マイルストーン:
   棟数が 10 / 25 / 50 に達すると、その建物の「正の生産量」に
   最終出力倍率(累積乗算ではない)が掛かる。
   例) 9棟=×1.00, 10棟=×1.15, 24棟=×1.15, 25棟=×1.33,
       49棟=×1.33, 50棟=×1.60
   消費量(発電機の木材消費、精製所の金属消費、電力需要)には掛けない。

   倍率は初回ジャンプの実測(手動クリック併用の標準プレイ)で決めている:
   目標は初回ジャンプ27〜30分・部品500からの空白8分以下。
   実測 1.15/1.33/1.60 で 27分47秒 / 空白7分57秒 / KP8。
   (50棟の倍率は初回ジャンプでは全建物が50棟に届かないため影響しない)
   ========================================================= */
(function (Game) {
  'use strict';

  var DEFAULT_MILESTONES = [
    { count: 10, multiplier: 1.15 },
    { count: 25, multiplier: 1.33 },
    { count: 50, multiplier: 1.60 },
  ];

  Game.BUILDING_DEFS = {
    woodcutter: {
      name: '伐採小屋',
      icon: 'icon-wood',
      baseCost: { wood: 10 },
      costGrowth: 1.13,
      output: { wood: 0.6 },
      consumes: {},
      milestones: DEFAULT_MILESTONES,
      unlockText: '最初から建設できる',
      unlockProgress: function () { return { current: 0, required: 0 }; },
    },
    miner: {
      name: '採掘機',
      icon: 'icon-metal',
      baseCost: { wood: 60 },
      costGrowth: 1.14,
      output: { metal: 0.35 },
      consumes: {},
      milestones: DEFAULT_MILESTONES,
      unlockText: '伐採小屋 1棟',
      unlockProgress: function (state) { return { current: state.buildings.woodcutter, required: 1 }; },
    },
    farm: {
      name: '農場',
      icon: 'icon-food',
      baseCost: { wood: 90, metal: 15 },
      costGrowth: 1.14,
      output: { food: 0.5 },
      consumes: {},
      milestones: DEFAULT_MILESTONES,
      unlockText: '生存者 1人',
      unlockProgress: function (state) { return { current: state.survivors.total, required: 1 }; },
    },
    generator: {
      name: '発電機',
      icon: 'icon-power',
      baseCost: { metal: 120 },
      costGrowth: 1.15,
      output: { power: 1.2 },
      consumes: { wood: 0.3 },
      milestones: DEFAULT_MILESTONES,
      unlockText: '採掘機 3棟',
      unlockProgress: function (state) { return { current: state.buildings.miner, required: 3 }; },
    },
    refinery: {
      name: '精製所',
      icon: 'icon-components',
      baseCost: { metal: 220 },
      costGrowth: 1.16,
      output: { components: 0.15 },
      consumes: { metal: 0.6, power: 1 },
      milestones: DEFAULT_MILESTONES,
      unlockText: '発電機 1棟',
      unlockProgress: function (state) { return { current: state.buildings.generator, required: 1 }; },
    },
  };

  // 解放進捗(建物定義の unlockProgress が正本。UI側で条件を再定義しない)
  Game.getUnlockProgress = function (key, state) {
    var def = Game.BUILDING_DEFS[key];
    if (!def) return { text: '', current: 0, required: 0, done: false, ratio: 0 };
    var raw = def.unlockProgress ? def.unlockProgress(state) : { current: 0, required: 0 };
    var required = Math.max(0, raw.required || 0);
    var current = Math.max(0, raw.current || 0);
    return {
      text: def.unlockText || '',
      current: required > 0 ? Math.min(current, required) : current,
      required: required,
      done: current >= required,
      ratio: required > 0 ? Math.min(1, current / required) : 1,
    };
  };

  Game.isBuildingUnlocked = function (state, key) {
    return Game.getUnlockProgress(key, state).done;
  };

  // 現在の棟数に対応する「最終出力倍率」(累積乗算しない)
  Game.getBuildingOutputMultiplier = function (key, state) {
    var def = Game.BUILDING_DEFS[key];
    if (!def || !def.milestones) return 1;
    var level = (state.buildings && state.buildings[key]) || 0;
    var multiplier = 1;
    def.milestones.forEach(function (milestone) {
      if (level >= milestone.count) multiplier = milestone.multiplier;
    });
    return multiplier;
  };

  // 次に到達できるマイルストーン(全て達成済みなら null)
  Game.getNextBuildingMilestone = function (key, state) {
    var def = Game.BUILDING_DEFS[key];
    if (!def || !def.milestones) return null;
    var level = (state.buildings && state.buildings[key]) || 0;
    for (var i = 0; i < def.milestones.length; i++) {
      var milestone = def.milestones[i];
      if (level < milestone.count) {
        return {
          count: milestone.count,
          multiplier: milestone.multiplier,
          level: level,
          remaining: milestone.count - level,
          ratio: milestone.count > 0 ? level / milestone.count : 1,
        };
      }
    }
    return null;
  };

  // 建物 key の次の1レベルにかかるコストを返す
  Game.getBuildingCost = function (key) {
    var state = Game.state;
    var def = Game.BUILDING_DEFS[key];
    var level = state.buildings[key];
    var cost = {};
    Object.keys(def.baseCost).forEach(function (res) {
      cost[res] = def.baseCost[res] * Math.pow(def.costGrowth, level);
    });
    return cost;
  };

  Game.canAfford = function (cost) {
    var state = Game.state;
    return Object.keys(cost).every(function (res) {
      return state.resources[res] >= cost[res];
    });
  };

  Game.spend = function (cost) {
    var state = Game.state;
    Object.keys(cost).forEach(function (res) {
      state.resources[res] -= cost[res];
    });
  };

  Game.buyBuilding = function (key) {
    var def = Game.BUILDING_DEFS[key];
    if (!def || !Game.isBuildingUnlocked(Game.state, key)) return false;
    var cost = Game.getBuildingCost(key);
    if (!Game.canAfford(cost)) return false;
    Game.spend(cost);
    Game.state.buildings[key] += 1;
    Game.checkAchievements();
    Game.render();
    return true;
  };
})(window.Game = window.Game || {});
