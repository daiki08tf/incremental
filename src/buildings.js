/* =========================================================
   buildings.js
   建物の定義、コスト計算、購入処理。
   ========================================================= */
(function (Game) {
  'use strict';

  Game.BUILDING_DEFS = {
    woodcutter: {
      name: '伐採小屋',
      icon: 'icon-wood',
      baseCost: { wood: 10 },
      costGrowth: 1.13,
      output: { wood: 0.6 },
      consumes: {},
      unlocked: function () { return true; },
    },
    miner: {
      name: '採掘機',
      icon: 'icon-metal',
      baseCost: { wood: 60 },
      costGrowth: 1.14,
      output: { metal: 0.35 },
      consumes: {},
      unlocked: function (state) { return state.buildings.woodcutter >= 1; },
    },
    farm: {
      name: '農場',
      icon: 'icon-food',
      baseCost: { wood: 40 },
      costGrowth: 1.14,
      output: { food: 0.5 },
      consumes: {},
      unlocked: function (state) { return state.survivors.total >= 1; },
    },
    generator: {
      name: '発電機',
      icon: 'icon-power',
      baseCost: { metal: 120 },
      costGrowth: 1.15,
      output: { power: 1.2 },
      consumes: { wood: 0.3 },
      unlocked: function (state) { return state.buildings.miner >= 3; },
    },
    refinery: {
      name: '精製所',
      icon: 'icon-components',
      baseCost: { metal: 220 },
      costGrowth: 1.16,
      output: { components: 0.15 },
      consumes: { metal: 0.6, power: 1 },
      unlocked: function (state) { return state.buildings.generator >= 1; },
    },
  };

  // 建物 key の次の1レベルにかかるコストを返す
  Game.getBuildingCost = function (key) {
    var state = Game.state;
    var def = Game.BUILDING_DEFS[key];
    var level = state.buildings[key];
    var cost = {};
    Object.keys(def.baseCost).forEach(function (res) {
      cost[res] = Math.ceil(def.baseCost[res] * Math.pow(def.costGrowth, level));
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
    if (!def || !def.unlocked(Game.state)) return false;
    var cost = Game.getBuildingCost(key);
    if (!Game.canAfford(cost)) return false;
    Game.spend(cost);
    Game.state.buildings[key] += 1;
    Game.checkAchievements();
    Game.render();
    return true;
  };
})(window.Game = window.Game || {});
