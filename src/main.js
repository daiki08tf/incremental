/* =========================================================
   main.js
   起動処理・ゲームループ・自動保存。
   ========================================================= */
(function (Game) {
  'use strict';

  function boot() {
    var loaded = Game.loadFromLocalStorage();
    Game.state = loaded || Game.createInitialState();

    if (loaded) {
      var offlineSeconds = Game.applyOfflineProgress(Game.state);
      if (offlineSeconds > 0) {
        var minutes = Math.floor(offlineSeconds / 60);
        Game.addLog('おかえりなさい。離脱していた間(約' + minutes + '分、上限あり)の生産を反映しました。');
      } else {
        Game.addLog('コロニーの記録を読み込みました。');
      }
    } else {
      Game.addLog('墜落した輸送船から、生存者たちが降り立った……');
    }

    Game.checkAchievements();
    Game.initUI();
    Game.render();
    Game.renderSaveStatus('準備完了');

    startLoop();
    startAutosave();

    window.addEventListener('beforeunload', function () {
      Game.saveToLocalStorage();
    });
  }

  // シミュレーションは1秒間に数回のtickで十分(アイドルゲームなので60fps不要)。
  // 毎フレームDOMを丸ごと再構築すると、ボタンが再生成され続けてクリックが
  // 取りこぼされる不具合につながるため、tick間隔=描画間隔として扱う。
  var TICK_INTERVAL_MS = 200;

  function startLoop() {
    var last = Date.now();
    setInterval(function () {
      var now = Date.now();
      var dt = (now - last) / 1000;
      last = now;
      // タブがバックグラウンドから復帰した際などの巨大なdtを防ぐ
      if (dt > 0 && dt < 5) {
        Game.tick(dt);
        Game.checkAchievements();
        Game.render();
      }
    }, TICK_INTERVAL_MS);
  }

  function startAutosave() {
    setInterval(function () {
      Game.saveToLocalStorage();
      Game.renderSaveStatus('自動保存済み ' + new Date().toLocaleTimeString('ja-JP'));
    }, Game.AUTOSAVE_INTERVAL_MS);
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.Game = window.Game || {});
