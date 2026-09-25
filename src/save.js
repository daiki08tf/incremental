/* =========================================================
   save.js
   保存の二本立て:
   1. LocalStorage自動保存(実績・統計を含む完全な状態)
   2. 「ふっかつのじゅもん」型セーブコード(主要パラメータのみ、
      精度優先。実績・統計は含めない = 端末ごとの記録として扱う)
   ========================================================= */
(function (Game) {
  'use strict';

  // ---------- LocalStorage ----------

  Game.saveToLocalStorage = function () {
    try {
      Game.state.lastActiveTime = Date.now();
      window.localStorage.setItem(Game.SAVE_KEY, JSON.stringify(Game.state));
      return true;
    } catch (e) {
      console.error('保存に失敗しました', e);
      return false;
    }
  };

  Game.loadFromLocalStorage = function () {
    try {
      var raw = window.localStorage.getItem(Game.SAVE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Game.normalizeState(parsed);
    } catch (e) {
      console.error('読み込みに失敗しました', e);
      return null;
    }
  };

  // 古いセーブや壊れたJSONに欠けているフィールドを初期値で補完する
  Game.normalizeState = function (parsed) {
    var fresh = Game.createInitialState();
    var state = Object.assign({}, fresh, parsed);
    state.resources = Object.assign({}, fresh.resources, parsed.resources);
    state.buildings = Object.assign({}, fresh.buildings, parsed.buildings);
    state.survivors = Object.assign({}, fresh.survivors, parsed.survivors);
    state.survivors.assigned = Object.assign({}, fresh.survivors.assigned, parsed.survivors && parsed.survivors.assigned);
    state.prestige = Object.assign({}, fresh.prestige, parsed.prestige);
    state.prestige.upgrades = Object.assign({}, fresh.prestige.upgrades, parsed.prestige && parsed.prestige.upgrades);
    state.achievements = Object.assign({}, parsed.achievements);
    state.stats = Object.assign({}, fresh.stats, parsed.stats);
    return state;
  };

  // ---------- セーブコード ----------

  function toBase36(n) {
    return Math.max(0, Math.round(n)).toString(36);
  }

  function checksum(str) {
    var sum = 0;
    for (var i = 0; i < str.length; i++) {
      sum = (sum * 31 + str.charCodeAt(i)) >>> 0;
    }
    return sum.toString(36).slice(-4);
  }

  Game.encodeSaveCode = function (state) {
    var nums = [];
    Game.RESOURCE_KEYS.forEach(function (k) { nums.push(state.resources[k] * 100); });
    Game.BUILDING_KEYS.forEach(function (k) { nums.push(state.buildings[k]); });
    nums.push(state.survivors.total);
    Game.BUILDING_KEYS.forEach(function (k) { nums.push(state.survivors.assigned[k] || 0); });
    nums.push(state.clickLevel);
    nums.push(state.prestige.count);
    nums.push(state.prestige.knowledge * 100);
    Game.PRESTIGE_UPGRADE_KEYS.forEach(function (k) { nums.push(state.prestige.upgrades[k]); });
    nums.push(Math.floor(state.lastActiveTime / 1000));

    var body = nums.map(toBase36).join('.');
    return body + '_' + checksum(body);
  };

  Game.decodeSaveCode = function (code) {
    code = (code || '').trim();
    var sepIndex = code.lastIndexOf('_');
    if (sepIndex === -1) throw new Error('コードの形式が正しくありません');
    var body = code.slice(0, sepIndex);
    var sum = code.slice(sepIndex + 1);
    if (checksum(body) !== sum) throw new Error('コードが壊れています(チェックサム不一致)');

    var nums = body.split('.').map(function (s) { return parseInt(s, 36); });
    if (nums.some(function (n) { return Number.isNaN(n); })) {
      throw new Error('コードを読み取れませんでした');
    }

    var state = Game.createInitialState();
    var i = 0;
    Game.RESOURCE_KEYS.forEach(function (k) { state.resources[k] = nums[i++] / 100; });
    Game.BUILDING_KEYS.forEach(function (k) { state.buildings[k] = nums[i++]; });
    state.survivors.total = nums[i++];
    Game.BUILDING_KEYS.forEach(function (k) { state.survivors.assigned[k] = nums[i++]; });
    state.clickLevel = nums[i++];
    state.prestige.count = nums[i++];
    state.prestige.knowledge = nums[i++] / 100;
    Game.PRESTIGE_UPGRADE_KEYS.forEach(function (k) { state.prestige.upgrades[k] = nums[i++]; });
    state.lastActiveTime = nums[i++] * 1000;
    return state;
  };

  // ---------- オフライン進行 ----------

  Game.applyOfflineProgress = function (state) {
    var elapsedMs = Date.now() - (state.lastActiveTime || Date.now());
    var elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    if (elapsedSeconds < 5) return 0; // 誤差レベルは無視
    var cappedSeconds = Math.min(elapsedSeconds, Game.OFFLINE_MAX_SECONDS);

    var prevState = Game.state;
    Game.state = state;
    Game.tick(cappedSeconds, { offline: true });
    Game.state = prevState;

    return cappedSeconds;
  };
})(window.Game = window.Game || {});
