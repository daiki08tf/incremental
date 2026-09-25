/* =========================================================
   state.js
   ゲーム状態の定義と初期値。
   ========================================================= */
(function (Game) {
  'use strict';

  Game.RESOURCE_KEYS = ['wood', 'metal', 'food', 'power', 'components'];
  Game.BUILDING_KEYS = ['woodcutter', 'miner', 'farm', 'generator', 'refinery'];
  Game.PRESTIGE_UPGRADE_KEYS = ['productionBoost', 'startingWood', 'populationCap', 'foodEfficiency'];

  Game.FOOD_PER_SURVIVOR = 0.15; // 1人あたりの食料消費/秒
  Game.BASE_POPULATION_CAP = 5;
  Game.MAX_CARRY_SURVIVORS = 3;
  Game.SAVE_KEY = 'ashfall_save_v1';
  Game.AUTOSAVE_INTERVAL_MS = 10000;
  Game.OFFLINE_MAX_SECONDS = 8 * 60 * 60; // 最大8時間分
  Game.OFFLINE_EFFICIENCY = 0.5;

  function createInitialState() {
    return {
      resources: { wood: 0, metal: 0, food: 0, power: 0, components: 0 },
      buildings: { woodcutter: 0, miner: 0, farm: 0, generator: 0, refinery: 0 },
      survivors: {
        total: 0,
        assigned: { woodcutter: 0, miner: 0, farm: 0, generator: 0, refinery: 0 },
      },
      clickLevel: 0,
      prestige: {
        count: 0,
        knowledge: 0,
        upgrades: { productionBoost: 0, startingWood: 0, populationCap: 0, foodEfficiency: 0 },
      },
      achievements: {},
      stats: {
        totalWoodCollected: 0,
        totalMetalCollected: 0,
        totalComponentsCollected: 0,
        totalClicks: 0,
        totalKnowledgeEarned: 0,
      },
      lastActiveTime: Date.now(),
    };
  }

  Game.createInitialState = createInitialState;
})(window.Game = window.Game || {});
