/* =========================================================
   planets.js
   惑星環境モディファイアの定義と導出の正本。

   - 惑星は state.prestige.count からのみ導出する。
     state.planet のような新しい保存フィールドは持たない
     (旧セーブ・セーブコード・リロード後も同じ惑星が完全に再現される)。
   - 倍率は「建物の正の生産量」にのみ掛かる。
     消費量(発電機の木材、精製所の金属、電力需要)には掛けない。
   - 手動クリックには掛けない(環境効果は建物生産だけが対象)。
   - 生産計算(resources.js)とUI(ui.js)は必ずこのファイルの
     共通関数を通す。惑星の数値をUI側へ二重定義しない。
   ========================================================= */
(function (Game) {
  'use strict';

  // prestige 0 は標準惑星(第1周、すべて×1.00)。
  // prestige 1 以降は PLANET_DEFS[1..] を順に循環する。
  Game.PLANET_DEFS = [
    {
      id: 'standard',
      name: '標準環境',
      description: '目立った偏りのない惑星',
      modifiers: { wood: 1.00, metal: 1.00, food: 1.00, power: 1.00, components: 1.00 },
    },
    {
      id: 'ore',
      name: '鉱脈惑星',
      description: '金属が豊富だが森林が少ない',
      // 金属 +25% は実測 -18.4%(Standard比)で ±15% 目安を外れたため、
      // シミュレータで -13.0% になる +18% まで下げている。
      modifiers: { metal: 1.18, wood: 0.90 },
    },
    {
      // Candidate B 再調整: 電力/食料は現行経済で効果が計測されないため、
      // 実際に効く木材(テンポ)と金属(律速)の組み合わせへ変更。
      id: 'forest',
      name: '森林惑星',
      description: '木材が豊富だが鉱脈が乏しい',
      modifiers: { wood: 1.25, metal: 0.85 },
    },
    {
      // Candidate B 再調整: 木材で広く建てられるが精製(部品)が弱く、
      // 速く脱出できる代わりに知識ポイントが最少になる。
      id: 'corroded',
      name: '腐食惑星',
      description: '植物は育つが機械の劣化が早い',
      modifiers: { wood: 1.20, components: 0.85 },
    },
    {
      id: 'industrial',
      name: '工業遺構惑星',
      description: '部品製造に有利だが電力効率が悪い',
      modifiers: { components: 1.20, power: 0.90 },
    },
  ];

  Game.PLANET_NO_EFFECT_TEXT = '変動なし';
  // 標準惑星(先頭)を除いた循環の長さ
  Game.PLANET_CYCLE_LENGTH = Game.PLANET_DEFS.length - 1;

  // prestige count から惑星 index を導出する唯一の関数。
  //   0 → 0(標準惑星)
  //   1 → 1, 2 → 2, 3 → 3, 4 → 4, 5 → 1, ...
  Game.getPlanetIndex = function (prestigeCount) {
    var count = Math.floor(Number(prestigeCount) || 0);
    if (count <= 0) return 0;
    return ((count - 1) % Game.PLANET_CYCLE_LENGTH) + 1;
  };

  Game.getPlanetByPrestigeCount = function (prestigeCount) {
    return Game.PLANET_DEFS[Game.getPlanetIndex(prestigeCount)];
  };

  Game.getCurrentPlanet = function (state) {
    var count = state && state.prestige ? state.prestige.count : 0;
    return Game.getPlanetByPrestigeCount(count);
  };

  // 次のジャンプで到着する惑星(ジャンプ前の事前表示に使う)
  Game.getNextPlanet = function (state) {
    var count = state && state.prestige ? state.prestige.count : 0;
    return Game.getPlanetByPrestigeCount(count + 1);
  };

  // 建物の正の生産量に掛かる惑星倍率(定義にない資源は×1.00)
  Game.getPlanetResourceMultiplier = function (state, resource) {
    var planet = Game.getCurrentPlanet(state);
    if (!planet || !planet.modifiers) return 1;
    var multiplier = planet.modifiers[resource];
    return (typeof multiplier === 'number' && multiplier > 0) ? multiplier : 1;
  };

  // 表示用の一覧。倍率の正本は PLANET_DEFS のみで、ここは整形だけを行う。
  Game.getPlanetModifierList = function (planet) {
    if (!planet || !planet.modifiers) return [];
    var keys = Game.RESOURCE_KEYS ? Game.RESOURCE_KEYS.slice() : Object.keys(planet.modifiers);
    return keys.filter(function (resource) {
      var multiplier = planet.modifiers[resource];
      return typeof multiplier === 'number' && multiplier !== 1;
    }).map(function (resource) {
      var multiplier = planet.modifiers[resource];
      return {
        resource: resource,
        multiplier: multiplier,
        percent: Math.round((multiplier - 1) * 100),
      };
    });
  };

  // 例) '金属 +25% / 木材 -10%'、変動がなければ '変動なし'
  //     options.separator           区切り文字(既定 ' / ')
  //     options.productionSuffix    true で「金属生産 +25%」のように生産を付ける
  Game.formatPlanetEffects = function (planet, options) {
    options = options || {};
    var separator = options.separator || ' / ';
    var list = Game.getPlanetModifierList(planet);
    if (list.length === 0) return Game.PLANET_NO_EFFECT_TEXT;
    return list.map(function (item) {
      var name = (Game.RESOURCE_NAMES && Game.RESOURCE_NAMES[item.resource]) || item.resource;
      if (options.productionSuffix) name += '生産';
      return name + ' ' + (item.percent > 0 ? '+' : '') + item.percent + '%';
    }).join(separator);
  };
})(window.Game = window.Game || {});
