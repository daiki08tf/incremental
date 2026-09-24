/* =========================================================
   resources.js
   資源の生産/消費計算(ゲームループの中核)。

   MVPでの簡略化(GDDからの実装上の割り切り):
   - 電力は「貯蔵する資源」ではなく毎tick再計算する瞬間流量として扱う。
     供給(発電機) < 需要(精製所など) の場合、電力を使う建物の稼働率を
     按分で下げる(RimWorldのブラウンアウトの簡易版)。
   - 食料は在庫として扱うが、枯渇時のペナルティは「在庫が0なら生産に
     一律ペナルティ」という単純な閾値式にしている(段階的な計算はしない)。
   ========================================================= */
(function (Game) {
  'use strict';

  Game.FOOD_PENALTY_MULTIPLIER = 0.5; // 食料が尽きているときの生産倍率

  // 実績/永続強化を反映した全体生産倍率
  Game.getGlobalMultiplier = function (state) {
    var prestigeBoost = 1 + 0.05 * state.prestige.upgrades.productionBoost;
    var unlockedCount = Object.keys(state.achievements).filter(function (id) {
      return state.achievements[id];
    }).length;
    var achievementBoost = 1 + 0.02 * unlockedCount;
    return prestigeBoost * achievementBoost;
  };

  Game.getSurvivorBonus = function (state, buildingKey) {
    var assigned = state.survivors.assigned[buildingKey] || 0;
    return 1 + 0.08 * assigned;
  };

  // dtSeconds 分のシミュレーションを1回だけ進める。
  // options.offline === true のときはオフライン算出用に効率を落とす。
  Game.tick = function (dtSeconds, options) {
    options = options || {};
    var state = Game.state;
    var offlineEfficiency = options.offline ? Game.OFFLINE_EFFICIENCY : 1;
    var globalMult = Game.getGlobalMultiplier(state) * offlineEfficiency;
    var foodPenalty = (state.survivors.total > 0 && state.resources.food <= 0)
      ? Game.FOOD_PENALTY_MULTIPLIER
      : 1;

    // 1. 建物ごとの素の生産/消費(電力按分前)を算出
    var raw = {};
    Game.BUILDING_KEYS.forEach(function (key) {
      var def = Game.BUILDING_DEFS[key];
      var level = state.buildings[key];
      var produce = {};
      var consume = {};
      if (level > 0) {
        var survivorBonus = Game.getSurvivorBonus(state, key);
        // マイルストーン倍率は「正の生産量」にのみ掛ける(消費量には掛けない)
        var milestoneMult = Game.getBuildingOutputMultiplier(key, state);
        Object.keys(def.output || {}).forEach(function (res) {
          produce[res] = def.output[res] * level * survivorBonus * milestoneMult * globalMult * foodPenalty;
        });
        Object.keys(def.consumes || {}).forEach(function (res) {
          consume[res] = def.consumes[res] * level;
        });
      }
      raw[key] = { produce: produce, consume: consume };
    });

    // 2. 各建物の稼働率を決める
    //   (a) 木材・金属などの「在庫資源」を消費する建物は、在庫+このtickの生産量で
    //       賄える分しか動けない(足りなければ消費者全体で按分)
    //   (b) 電力は貯蔵しないため、発電量(発電機の稼働率込み)と需要で按分
    var ratio = {};
    Game.BUILDING_KEYS.forEach(function (key) { ratio[key] = 1; });

    Game.RESOURCE_KEYS.forEach(function (res) {
      if (res === 'power') return;
      var demand = 0;
      var produced = 0;
      Game.BUILDING_KEYS.forEach(function (key) {
        demand += raw[key].consume[res] || 0;
        produced += raw[key].produce[res] || 0;
      });
      if (demand <= 0) return;
      var available = state.resources[res] + produced * dtSeconds;
      var resRatio = Math.max(0, Math.min(1, available / (demand * dtSeconds)));
      Game.BUILDING_KEYS.forEach(function (key) {
        if (raw[key].consume[res]) ratio[key] = Math.min(ratio[key], resRatio);
      });
    });

    var powerSupply = 0;
    var powerDemand = 0;
    Game.BUILDING_KEYS.forEach(function (key) {
      powerSupply += (raw[key].produce.power || 0) * ratio[key];
      powerDemand += (raw[key].consume.power || 0) * ratio[key];
    });
    var powerRatio = powerDemand > 0 ? Math.min(1, powerSupply / powerDemand) : 1;
    Game.BUILDING_KEYS.forEach(function (key) {
      if (raw[key].consume.power) ratio[key] *= powerRatio;
    });

    Game.BUILDING_KEYS.forEach(function (key) {
      Object.keys(raw[key].produce).forEach(function (res) {
        raw[key].produce[res] *= ratio[key];
      });
      Object.keys(raw[key].consume).forEach(function (res) {
        raw[key].consume[res] *= ratio[key];
      });
    });
    var powerUsed = powerDemand * powerRatio;

    // 3. 資源へ反映
    var delta = { wood: 0, metal: 0, food: 0, power: 0, components: 0 };
    Game.BUILDING_KEYS.forEach(function (key) {
      Object.keys(raw[key].produce).forEach(function (res) {
        delta[res] += raw[key].produce[res] * dtSeconds;
      });
      Object.keys(raw[key].consume).forEach(function (res) {
        delta[res] -= raw[key].consume[res] * dtSeconds;
      });
    });

    // 食料は生存者の維持で消費(食料効率アップで軽減)
    var foodEff = 1 - 0.08 * state.prestige.upgrades.foodEfficiency;
    if (foodEff < 0.2) foodEff = 0.2;
    delta.food -= state.survivors.total * Game.FOOD_PER_SURVIVOR * foodEff * dtSeconds;

    var rates = {};
    Game.RESOURCE_KEYS.forEach(function (res) {
      if (res === 'power') {
        // 電力は貯蔵しない瞬間流量として表示用に上書き(需給差の目安)
        state.resources.power = powerSupply - powerUsed;
        rates.power = state.resources.power;
        return;
      }
      state.resources[res] = Math.max(0, state.resources[res] + delta[res]);
      rates[res] = dtSeconds > 0 ? delta[res] / dtSeconds : 0;
    });
    Game.lastRates = rates;

    // 統計(実績判定用)
    if (delta.wood > 0) state.stats.totalWoodCollected += delta.wood;
    if (delta.metal > 0) state.stats.totalMetalCollected += delta.metal;
    var componentsProduced = (raw.refinery.produce.components || 0) * dtSeconds;
    if (componentsProduced > 0) state.stats.totalComponentsCollected += componentsProduced;

    Game.lastPowerInfo = { supply: powerSupply, demand: powerDemand, ratio: powerRatio };
  };

  // 手動クリックによる木材採集
  Game.getClickAmount = function () {
    var state = Game.state;
    var globalMult = Game.getGlobalMultiplier(state);
    return (1 + state.clickLevel) * globalMult;
  };

  Game.doManualClick = function () {
    var state = Game.state;
    var amount = Game.getClickAmount();
    state.resources.wood += amount;
    state.stats.totalWoodCollected += amount;
    state.stats.totalClicks += 1;
    Game.checkAchievements();
    Game.render();
  };

  Game.getClickUpgradeCost = function () {
    return Math.ceil(15 * Math.pow(1.6, Game.state.clickLevel));
  };

  Game.buyClickUpgrade = function () {
    var cost = Game.getClickUpgradeCost();
    if (Game.state.resources.wood < cost) return false;
    Game.state.resources.wood -= cost;
    Game.state.clickLevel += 1;
    Game.render();
    return true;
  };
})(window.Game = window.Game || {});
