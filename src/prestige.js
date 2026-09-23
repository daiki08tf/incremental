/* =========================================================
   prestige.js
   脱出船の建造条件、惑星ジャンプ(プレステージ)処理、
   知識ポイントによる永続強化。
   ========================================================= */
(function (Game) {
  'use strict';

  Game.ESCAPE_REQUIREMENTS = { components: 500, metal: 800 };

  Game.PRESTIGE_UPGRADE_DEFS = {
    productionBoost: { name: '生産効率 +5%', baseCost: 3, growth: 1.6, max: 20 },
    startingWood: { name: '開始時の木材 +100', baseCost: 2, growth: 1.5, max: 20 },
    populationCap: { name: '生存者の上限 +1', baseCost: 4, growth: 1.7, max: 15 },
    foodEfficiency: { name: '食料消費 -8%', baseCost: 3, growth: 1.6, max: 5 },
  };

  Game.canPrestige = function (state) {
    return state.resources.components >= Game.ESCAPE_REQUIREMENTS.components
      && state.resources.metal >= Game.ESCAPE_REQUIREMENTS.metal;
  };

  // 脱出条件の達成度。部品と金属の両方が必要なので、進捗率は
  // 「より遅れている方(ボトルネック)」= 両条件の達成率の最小値で表す。
  // 必要量の正本は ESCAPE_REQUIREMENTS で、UI側では再定義しない。
  Game.getEscapeProgress = function (state) {
    var resources = {};
    var ratios = [];
    Object.keys(Game.ESCAPE_REQUIREMENTS).forEach(function (res) {
      var required = Game.ESCAPE_REQUIREMENTS[res];
      var current = (state.resources && state.resources[res]) || 0;
      var ratio = required > 0 ? Math.min(1, current / required) : 1;
      resources[res] = {
        current: current,
        required: required,
        ratio: ratio,
        done: current >= required,
      };
      ratios.push(ratio);
    });
    return {
      resources: resources,
      ratio: ratios.length > 0 ? Math.min.apply(null, ratios) : 1,
      done: Game.canPrestige(state),
    };
  };

  Game.calcKnowledgeGain = function (state) {
    var score = (state.resources.components * 2 + state.resources.metal) / 40;
    return Math.max(1, Math.floor(Math.sqrt(score)));
  };

  // 惑星ジャンプを実行する。carryCount は同行させる生存者の人数(0〜3)。
  Game.doPrestige = function (carryCount) {
    var state = Game.state;
    if (!Game.canPrestige(state)) return false;

    var kpGained = Game.calcKnowledgeGain(state);
    var carry = Math.max(0, Math.min(Game.MAX_CARRY_SURVIVORS, carryCount || 0, state.survivors.total));

    state.resources = {
      wood: 100 * state.prestige.upgrades.startingWood,
      metal: 0,
      food: 0,
      power: 0,
      components: 0,
    };
    Game.BUILDING_KEYS.forEach(function (key) {
      state.buildings[key] = 0;
    });
    state.survivors.total = carry;
    Game.BUILDING_KEYS.forEach(function (key) {
      state.survivors.assigned[key] = 0;
    });
    state.clickLevel = 0;

    state.prestige.count += 1;
    state.prestige.knowledge += kpGained;
    state.stats.totalKnowledgeEarned += kpGained;

    // 到着した惑星と環境効果をログに残す(惑星名・効果は planets.js が正本)
    var planet = Game.getCurrentPlanet(state);
    Game.addLog(
      '第' + (state.prestige.count + 1) + '惑星「' + planet.name + '」へ到着。'
      + Game.formatPlanetEffects(planet, { separator: '、', productionSuffix: true })
      + '。(知識 +' + kpGained + ')'
    );
    Game.checkAchievements();
    Game.render();
    return true;
  };

  Game.getPrestigeUpgradeCost = function (key) {
    var def = Game.PRESTIGE_UPGRADE_DEFS[key];
    var level = Game.state.prestige.upgrades[key];
    return Math.ceil(def.baseCost * Math.pow(def.growth, level));
  };

  Game.buyPrestigeUpgrade = function (key) {
    var state = Game.state;
    var def = Game.PRESTIGE_UPGRADE_DEFS[key];
    var level = state.prestige.upgrades[key];
    if (level >= def.max) return false;
    var cost = Game.getPrestigeUpgradeCost(key);
    if (state.prestige.knowledge < cost) return false;
    state.prestige.knowledge -= cost;
    state.prestige.upgrades[key] += 1;
    Game.render();
    return true;
  };
})(window.Game = window.Game || {});
