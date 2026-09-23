/* =========================================================
   ui.js
   DOMの描画とイベントバインド。
   ========================================================= */
(function (Game) {
  'use strict';

  Game.RESOURCE_NAMES = { wood: '木材', metal: '金属', food: '食料', power: '電力', components: '部品' };
  Game.logMessages = [];
  Game.carrySelection = 0;
  Game.modalMode = null; // 'export' | 'import'

  // ---------- 数値フォーマット ----------

  Game.formatNumber = function (n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '0';
    var sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n < 1000) return sign + (Number.isInteger(n) ? String(n) : n.toFixed(1));
    var units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
    var unitIndex = -1;
    while (n >= 1000 && unitIndex < units.length - 1) {
      n /= 1000;
      unitIndex += 1;
    }
    return sign + n.toFixed(2) + units[unitIndex];
  };

  Game.formatRate = function (n) {
    var sign = n >= 0 ? '+' : '';
    return sign + Game.formatNumber(n) + '/s';
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---------- ログ ----------

  Game.addLog = function (message) {
    var time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    Game.logMessages.unshift('[' + time + '] ' + message);
    if (Game.logMessages.length > 50) Game.logMessages.length = 50;
    renderLog();
  };

  function renderLog() {
    var panel = document.getElementById('log-panel');
    panel.innerHTML = Game.logMessages
      .map(function (m) { return '<div class="log-line">' + escapeHtml(m) + '</div>'; })
      .join('');
  }

  // ---------- 各パネルの描画 ----------

  function renderResources() {
    var list = document.getElementById('resource-list');
    list.innerHTML = '';
    Game.RESOURCE_KEYS.forEach(function (key) {
      var li = document.createElement('li');

      var icon = document.createElement('span');
      icon.className = 'pixel-icon icon-' + key;

      var name = document.createElement('span');
      name.textContent = Game.RESOURCE_NAMES[key];

      var amount = document.createElement('span');
      amount.className = 'amount';
      amount.textContent = Game.formatNumber(Game.state.resources[key]);

      var rate = document.createElement('span');
      rate.className = 'rate';
      var r = (Game.lastRates && Game.lastRates[key]) || 0;
      rate.textContent = key === 'power' ? '(' + Game.formatNumber(r) + ')' : Game.formatRate(r);

      li.appendChild(icon);
      li.appendChild(name);
      li.appendChild(amount);
      li.appendChild(rate);
      list.appendChild(li);
    });
  }

  function renderClickArea() {
    document.getElementById('click-amount').textContent = Game.formatNumber(Game.getClickAmount());
    document.getElementById('click-level').textContent = Game.state.clickLevel;
    var cost = Game.getClickUpgradeCost();
    document.getElementById('click-upgrade-cost').textContent = Game.formatNumber(cost);
    document.getElementById('btn-upgrade-click').disabled = Game.state.resources.wood < cost;
  }

  function renderBuildings() {
    var state = Game.state;
    var list = document.getElementById('building-list');
    list.innerHTML = '';
    Game.BUILDING_KEYS.forEach(function (key) {
      var def = Game.BUILDING_DEFS[key];
      if (!Game.isBuildingUnlocked(state, key)) {
        // 未解放でも「次に何が建つか」「あと何が必要か」が分かるようにする
        var progress = Game.getUnlockProgress(key, state);
        var lockedLi = document.createElement('li');
        lockedLi.className = 'building-item locked';

        var lockedIcon = document.createElement('span');
        lockedIcon.className = 'pixel-icon ' + def.icon;

        var lockedInfo = document.createElement('div');
        var lockedName = document.createElement('div');
        lockedName.className = 'b-name';
        lockedName.textContent = def.name;
        var lockedDetail = document.createElement('div');
        lockedDetail.className = 'b-detail';
        lockedDetail.textContent = '解放条件: ' + progress.text + '（' + progress.current + '/' + progress.required + '）';
        lockedInfo.appendChild(lockedName);
        lockedInfo.appendChild(lockedDetail);

        var lockedTag = document.createElement('span');
        lockedTag.className = 'locked-tag';
        lockedTag.textContent = '未解放';

        lockedLi.appendChild(lockedIcon);
        lockedLi.appendChild(lockedInfo);
        lockedLi.appendChild(lockedTag);
        list.appendChild(lockedLi);
        return;
      }
      var level = state.buildings[key];
      var cost = Game.getBuildingCost(key);
      var affordable = Game.canAfford(cost);

      var li = document.createElement('li');
      li.className = 'building-item';

      var icon = document.createElement('span');
      icon.className = 'pixel-icon ' + def.icon;

      var info = document.createElement('div');
      var nameEl = document.createElement('div');
      nameEl.className = 'b-name';
      nameEl.textContent = def.name + ' Lv.' + level;

      var detail = document.createElement('div');
      detail.className = 'b-detail';
      var outputParts = Object.keys(def.output).map(function (res) {
        // 表示も生産計算と同じ共通関数を使う(素の生産 × 生存者 × 全体 × マイルストーン × 惑星環境)
        var perSec = def.output[res] * level * Game.getSurvivorBonus(state, key)
          * Game.getBuildingOutputMultiplier(key, state)
          * Game.getGlobalMultiplier(state)
          * Game.getPlanetResourceMultiplier(state, res);
        return '+' + Game.formatNumber(perSec) + Game.RESOURCE_NAMES[res] + '/s';
      });
      var consumeParts = Object.keys(def.consumes).map(function (res) {
        var perSec = def.consumes[res] * level;
        return '-' + Game.formatNumber(perSec) + Game.RESOURCE_NAMES[res] + '/s';
      });
      var costText = Object.keys(cost).map(function (res) {
        return Game.formatNumber(cost[res]) + Game.RESOURCE_NAMES[res];
      }).join(' + ');
      var statusText = (level > 0 ? outputParts.concat(consumeParts).join(' ') : '未建設');
      detail.textContent = statusText + ' / 次のコスト: ' + costText;

      info.appendChild(nameEl);
      info.appendChild(detail);

      // マイルストーンは UI 側で再定義せず、buildings.js の共通関数から取得する
      var milestoneEl = document.createElement('div');
      milestoneEl.className = 'b-milestone';
      var milestoneMult = Game.getBuildingOutputMultiplier(key, state);
      var nextMilestone = Game.getNextBuildingMilestone(key, state);
      if (nextMilestone) {
        milestoneEl.textContent = '生産 ×' + milestoneMult.toFixed(2)
          + ' / 次の節目: ' + nextMilestone.count + '棟まであと' + nextMilestone.remaining
          + '棟（達成で×' + nextMilestone.multiplier.toFixed(2) + '）';
      } else {
        milestoneEl.textContent = '生産 ×' + milestoneMult.toFixed(2) + ' / マイルストーン全達成';
      }
      info.appendChild(milestoneEl);

      var buyBtn = document.createElement('button');
      buyBtn.className = 'btn btn-small';
      buyBtn.textContent = '建設';
      buyBtn.disabled = !affordable;
      buyBtn.addEventListener('click', function () { Game.buyBuilding(key); });

      li.appendChild(icon);
      li.appendChild(info);
      li.appendChild(buyBtn);
      list.appendChild(li);
    });
  }

  function renderSurvivors() {
    var state = Game.state;
    var cap = Game.getPopulationCap(state);
    document.getElementById('survivor-count-text').textContent = state.survivors.total + ' / ' + cap;

    var cost = Game.getSurvivorAcceptCost();
    document.getElementById('survivor-cost').textContent = Game.formatNumber(cost);
    document.getElementById('btn-accept-survivor').disabled = state.survivors.total >= cap || state.resources.wood < cost;

    var assignList = document.getElementById('survivor-assign-list');
    assignList.innerHTML = '';

    var unassigned = Game.getUnassignedSurvivors(state);
    var unassignedRow = document.createElement('div');
    unassignedRow.className = 'assign-row';
    unassignedRow.innerHTML = '<span class="assign-name">未割り当て</span><span>' + unassigned + '人</span>';
    assignList.appendChild(unassignedRow);

    Game.BUILDING_KEYS.forEach(function (key) {
      if (state.buildings[key] <= 0) return;
      var def = Game.BUILDING_DEFS[key];

      var row = document.createElement('div');
      row.className = 'assign-row';

      var name = document.createElement('span');
      name.className = 'assign-name';
      name.textContent = def.name;

      var minus = document.createElement('button');
      minus.className = 'btn btn-tiny';
      minus.textContent = '-';
      minus.disabled = (state.survivors.assigned[key] || 0) <= 0;
      minus.addEventListener('click', function () { Game.unassignSurvivor(key); });

      var count = document.createElement('span');
      count.textContent = state.survivors.assigned[key] || 0;

      var plus = document.createElement('button');
      plus.className = 'btn btn-tiny';
      plus.textContent = '+';
      plus.disabled = unassigned <= 0;
      plus.addEventListener('click', function () { Game.assignSurvivor(key); });

      row.appendChild(name);
      row.appendChild(minus);
      row.appendChild(count);
      row.appendChild(plus);
      assignList.appendChild(row);
    });
  }

  function renderPrestige() {
    var state = Game.state;
    var req = Game.ESCAPE_REQUIREMENTS;

    document.getElementById('prestige-requirements').textContent =
      '必要資源 — 部品: ' + Game.formatNumber(state.resources.components) + ' / ' + Game.formatNumber(req.components)
      + ' ・ 金属: ' + Game.formatNumber(state.resources.metal) + ' / ' + Game.formatNumber(req.metal);

    var maxCarry = Math.min(Game.MAX_CARRY_SURVIVORS, state.survivors.total);
    if (Game.carrySelection > maxCarry) Game.carrySelection = maxCarry;
    document.getElementById('carry-count').textContent = Game.carrySelection;
    document.getElementById('carry-minus').disabled = Game.carrySelection <= 0;
    document.getElementById('carry-plus').disabled = Game.carrySelection >= maxCarry;

    document.getElementById('knowledge-count').textContent = Game.formatNumber(state.prestige.knowledge);
    document.getElementById('btn-prestige').disabled = !Game.canPrestige(state);

    var upgradeList = document.getElementById('prestige-upgrade-list');
    upgradeList.innerHTML = '';
    Game.PRESTIGE_UPGRADE_KEYS.forEach(function (key) {
      var def = Game.PRESTIGE_UPGRADE_DEFS[key];
      var level = state.prestige.upgrades[key];

      var li = document.createElement('li');
      li.className = 'upgrade-item';

      var label = document.createElement('span');
      label.textContent = def.name + ' (Lv.' + level + (level >= def.max ? '/MAX' : '') + ')';

      var btn = document.createElement('button');
      btn.className = 'btn btn-tiny';
      if (level >= def.max) {
        btn.textContent = 'MAX';
        btn.disabled = true;
      } else {
        var cost = Game.getPrestigeUpgradeCost(key);
        btn.textContent = cost;
        btn.disabled = state.prestige.knowledge < cost;
        btn.addEventListener('click', function () { Game.buyPrestigeUpgrade(key); });
      }

      li.appendChild(label);
      li.appendChild(btn);
      upgradeList.appendChild(li);
    });
  }

  function renderAchievements() {
    var list = document.getElementById('achievement-list');
    list.innerHTML = '';
    Game.ACHIEVEMENT_DEFS.forEach(function (def) {
      var unlocked = !!Game.state.achievements[def.id];
      var li = document.createElement('li');
      li.className = 'achievement-item' + (unlocked ? ' unlocked' : '');
      li.textContent = (unlocked ? '[済] ' : '[  ] ') + def.name + ' — ' + def.desc;
      list.appendChild(li);
    });
  }

  function renderHeader() {
    var state = Game.state;
    var planet = Game.getCurrentPlanet(state);
    document.getElementById('planet-count').textContent = '第' + (state.prestige.count + 1) + '惑星';

    // 惑星名と環境効果は planets.js の定義から生成する(UI側で数値を持たない)
    var currentEl = document.getElementById('planet-current');
    if (currentEl) {
      currentEl.textContent = '惑星: ' + planet.name + ' — ' + Game.formatPlanetEffects(planet);
    }

    // ジャンプ可能なときだけ、次の惑星を事前表示する
    var nextEl = document.getElementById('planet-next');
    if (nextEl) {
      if (Game.canPrestige(state)) {
        var next = Game.getNextPlanet(state);
        nextEl.textContent = '次の惑星: ' + next.name + ' — ' + Game.formatPlanetEffects(next);
      } else {
        nextEl.textContent = '';
      }
    }
  }

  // ---------- 次の目標 ----------

  // 次の目標の優先順位:
  //   1. 未解放の建物がある → 最も達成に近い解放を1件
  //   2. ジャンプ可能       → 予想知識ポイント
  //   3. それ以外           → 次の建物マイルストーン と 脱出条件 を達成度で比較し、
  //                          達成に近い方(同率ならマイルストーン)を1件
  // 達成度はすべて正本(建物定義・Game.ESCAPE_REQUIREMENTS)から導出し、
  // この画面側で条件や倍率を二重定義しない。
  Game.getNextGoal = function (state) {
    var unlockGoal = null;
    Game.BUILDING_KEYS.forEach(function (key) {
      var progress = Game.getUnlockProgress(key, state);
      if (progress.done) return;
      if (!unlockGoal || progress.ratio > unlockGoal.ratio) {
        unlockGoal = {
          kind: 'unlock',
          ratio: progress.ratio,
          text: Game.BUILDING_DEFS[key].name + ' を解放 — ' + progress.text
            + '（' + progress.current + '/' + progress.required + '）',
        };
      }
    });
    if (unlockGoal) return unlockGoal;

    if (Game.canPrestige(state)) {
      return {
        kind: 'jump',
        ratio: 1,
        text: '惑星ジャンプ可能 — 予想知識 +' + Game.calcKnowledgeGain(state) + ' KP',
      };
    }

    var milestoneGoal = null;
    Game.BUILDING_KEYS.forEach(function (key) {
      var next = Game.getNextBuildingMilestone(key, state);
      if (!next) return;
      if (!milestoneGoal || next.ratio > milestoneGoal.ratio) {
        milestoneGoal = {
          kind: 'milestone',
          ratio: next.ratio,
          text: Game.BUILDING_DEFS[key].name + ' ' + next.count + '棟まであと' + next.remaining
            + '棟 — 達成で生産 ×' + next.multiplier.toFixed(2),
        };
      }
    });

    var escape = Game.getEscapeProgress(state);
    var escapeText = Object.keys(escape.resources).map(function (res) {
      var progress = escape.resources[res];
      return Game.RESOURCE_NAMES[res] + ' ' + Game.formatNumber(progress.current)
        + '/' + Game.formatNumber(progress.required);
    }).join(' ・ ');
    var escapeGoal = {
      kind: 'escape',
      ratio: escape.ratio,
      text: '脱出船 — ' + escapeText,
    };

    if (milestoneGoal && milestoneGoal.ratio >= escapeGoal.ratio) return milestoneGoal;
    return escapeGoal;
  };

  function renderNextGoal() {
    var el = document.getElementById('next-goal-text');
    if (!el) return;
    var goal = Game.getNextGoal(Game.state);
    el.textContent = goal ? goal.text : '—';
  }

  function renderSaveStatus(text) {
    document.getElementById('save-status').textContent = text || '';
  }
  Game.renderSaveStatus = renderSaveStatus;

  Game.render = function () {
    renderHeader();
    renderResources();
    renderClickArea();
    renderBuildings();
    renderSurvivors();
    renderPrestige();
    renderAchievements();
    renderNextGoal();
  };

  // ---------- モーダル ----------

  function openModal(mode) {
    Game.modalMode = mode;
    var overlay = document.getElementById('modal-overlay');
    var title = document.getElementById('modal-title');
    var textarea = document.getElementById('modal-textarea');
    var note = document.getElementById('modal-note');

    if (mode === 'export') {
      title.textContent = 'セーブコード(コピーして保存してください)';
      textarea.value = Game.encodeSaveCode(Game.state);
      textarea.readOnly = true;
      note.textContent = '※ 実績・統計はこのコードに含まれません(端末ごとのLocalStorageに保存されます)。';
      textarea.select();
    } else {
      title.textContent = 'セーブコードを読み込む';
      textarea.value = '';
      textarea.readOnly = false;
      note.textContent = '別端末で発行したコードを貼り付けてください。現在の進行状況は上書きされます。';
    }
    overlay.hidden = false;
  }

  function closeModal() {
    document.getElementById('modal-overlay').hidden = true;
    Game.modalMode = null;
  }

  function handleModalConfirm() {
    if (Game.modalMode === 'import') {
      var code = document.getElementById('modal-textarea').value;
      try {
        var imported = Game.decodeSaveCode(code);
        // 実績・統計はこの端末のものを維持する(ハイブリッド仕様)
        imported.achievements = Object.assign({}, Game.state.achievements);
        imported.stats = Object.assign({}, Game.state.stats);
        Game.state = imported;
        var offlineSec = Game.applyOfflineProgress(Game.state);
        Game.saveToLocalStorage();
        Game.render();
        Game.addLog('セーブコードを読み込みました' + (offlineSec > 0 ? '(放置分 ' + Math.floor(offlineSec / 60) + '分 を反映)' : ''));
      } catch (e) {
        window.alert('読み込みに失敗しました: ' + e.message);
        return;
      }
    }
    closeModal();
  }

  // ---------- イベントバインド ----------

  Game.initUI = function () {
    document.getElementById('btn-click').addEventListener('click', function () { Game.doManualClick(); });
    document.getElementById('btn-upgrade-click').addEventListener('click', function () { Game.buyClickUpgrade(); });
    document.getElementById('btn-accept-survivor').addEventListener('click', function () { Game.acceptSurvivor(); });

    document.getElementById('carry-plus').addEventListener('click', function () {
      var maxCarry = Math.min(Game.MAX_CARRY_SURVIVORS, Game.state.survivors.total);
      if (Game.carrySelection < maxCarry) Game.carrySelection += 1;
      Game.render();
    });
    document.getElementById('carry-minus').addEventListener('click', function () {
      if (Game.carrySelection > 0) Game.carrySelection -= 1;
      Game.render();
    });

    document.getElementById('btn-prestige').addEventListener('click', function () {
      if (!Game.canPrestige(Game.state)) return;
      var ok = window.confirm('脱出船を発進します。現在の建物・資源は失われますが、知識ポイントと同行させた生存者' + Game.carrySelection + '人は引き継がれます。よろしいですか?');
      if (!ok) return;
      Game.doPrestige(Game.carrySelection);
      Game.carrySelection = 0;
      Game.saveToLocalStorage();
    });

    document.getElementById('btn-export').addEventListener('click', function () { openModal('export'); });
    document.getElementById('btn-import').addEventListener('click', function () { openModal('import'); });
    document.getElementById('modal-confirm').addEventListener('click', handleModalConfirm);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);

    document.getElementById('btn-reset').addEventListener('click', function () {
      var ok = window.confirm('本当に最初からやり直しますか?この操作は取り消せません。');
      if (!ok) return;
      Game.state = Game.createInitialState();
      Game.carrySelection = 0;
      Game.saveToLocalStorage();
      Game.render();
      Game.addLog('コロニーの記録を消去し、最初からやり直します。');
    });
  };
})(window.Game = window.Game || {});
