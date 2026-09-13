/* =========================================================
   achievements.js
   実績の定義と判定。
   実績はLocalStorageにのみ保存し、セーブコードには含めない
   (GDD 7章・9章のハイブリッド仕様)。
   ========================================================= */
(function (Game) {
  'use strict';

  Game.ACHIEVEMENT_DEFS = [
    { id: 'first_click', name: '最初の一歩', desc: '木材を初めて手動で集めた', check: function (s) { return s.stats.totalClicks >= 1; } },
    { id: 'first_building', name: '拠点の礎', desc: '初めて建物を建てた', check: function (s) { return Game.BUILDING_KEYS.some(function (k) { return s.buildings[k] >= 1; }); } },
    { id: 'first_survivor', name: '仲間', desc: '初めて生存者を迎え入れた', check: function (s) { return s.survivors.total >= 1; } },
    { id: 'clicks_100', name: '働き者', desc: 'クリックを100回行った', check: function (s) { return s.stats.totalClicks >= 100; } },
    { id: 'wood_1000', name: '木こり', desc: '木材を累計1000集めた', check: function (s) { return s.stats.totalWoodCollected >= 1000; } },
    { id: 'metal_500', name: '採掘者', desc: '金属を累計500集めた', check: function (s) { return s.stats.totalMetalCollected >= 500; } },
    { id: 'components_100', name: '技師', desc: '部品を累計100生産した', check: function (s) { return s.stats.totalComponentsCollected >= 100; } },
    { id: 'survivors_5', name: '小さな集落', desc: '生存者が5人になった', check: function (s) { return s.survivors.total >= 5; } },
    { id: 'building_lvl10', name: '拡張の証', desc: 'いずれかの建物をLv.10にした', check: function (s) { return Game.BUILDING_KEYS.some(function (k) { return s.buildings[k] >= 10; }); } },
    { id: 'first_prestige', name: '旅立ち', desc: '初めて惑星ジャンプを行った', check: function (s) { return s.prestige.count >= 1; } },
    { id: 'prestige_3', name: '流浪の民', desc: '惑星ジャンプを3回行った', check: function (s) { return s.prestige.count >= 3; } },
    { id: 'knowledge_50', name: '蓄積された知恵', desc: '知識ポイントを累計50獲得した', check: function (s) { return s.stats.totalKnowledgeEarned >= 50; } },
  ];

  Game.checkAchievements = function () {
    var state = Game.state;
    var unlockedNew = [];
    Game.ACHIEVEMENT_DEFS.forEach(function (def) {
      if (state.achievements[def.id]) return;
      if (def.check(state)) {
        state.achievements[def.id] = true;
        unlockedNew.push(def);
      }
    });
    unlockedNew.forEach(function (def) {
      Game.addLog('実績解放: ' + def.name);
    });
    return unlockedNew;
  };
})(window.Game = window.Game || {});
