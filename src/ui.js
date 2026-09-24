/* =========================================================
   ui.js
   DOMの描画とイベントバインド。
   ========================================================= */
(function (Game) {
  'use strict';

  Game.RESOURCE_NAMES = { wood: '木材', metal: '金属', food: '食料', power: '電力', components: '部品' };
  Game.logMessages = [];
  Game.carrySelection = 0;

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

  // ---------- 描画の基本方針 ----------
  // 各パネルのDOMは初回に一度だけ組み立て、以降は文字・disabled・hiddenだけを
  // 書き換える。描画ループ(200ms毎)でボタンを作り直すと、指を置いてから
  // 離すまでの間にボタンが差し替わりタップが成立しないため(特にスマホ)。
  // クリック処理も各パネルのコンテナ1箇所でdata-*属性から判定する(イベント委譲)。

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // 値が変わった時だけDOMに書き込む(無駄な再レイアウトを避ける)
  function setText(node, text) {
    text = String(text);
    if (node.textContent !== text) node.textContent = text;
  }
  function setDisabled(node, disabled) {
    if (node.disabled !== disabled) node.disabled = disabled;
  }
  function setHidden(node, hidden) {
    if (node.hidden !== hidden) node.hidden = hidden;
  }

  var refs = null;

  function buildUI() {
    refs = { resources: {}, buildings: {}, assign: {}, upgrades: {}, achievements: {} };

    // 資源
    var resList = document.getElementById('resource-list');
    resList.innerHTML = '';
    Game.RESOURCE_KEYS.forEach(function (key) {
      var li = el('li');
      li.appendChild(el('span', 'pixel-icon icon-' + key));
      li.appendChild(el('span', null, Game.RESOURCE_NAMES[key]));
      var amount = el('span', 'amount');
      var rate = el('span', 'rate');
      li.appendChild(amount);
      li.appendChild(rate);
      resList.appendChild(li);
      refs.resources[key] = { amount: amount, rate: rate };
    });

    // 建物(未解放の行は hidden にしておく)
    var bList = document.getElementById('building-list');
    bList.innerHTML = '';
    Game.BUILDING_KEYS.forEach(function (key) {
      var def = Game.BUILDING_DEFS[key];
      var li = el('li', 'building-item');
      li.appendChild(el('span', 'pixel-icon ' + def.icon));
      var info = el('div');
      var name = el('div', 'b-name');
      var detail = el('div', 'b-detail');
      info.appendChild(name);
      info.appendChild(detail);
      var btn = el('button', 'btn btn-small', '建設');
      btn.dataset.action = 'build';
      btn.dataset.key = key;
      li.appendChild(info);
      li.appendChild(btn);
      bList.appendChild(li);
      refs.buildings[key] = { row: li, name: name, detail: detail, btn: btn };
    });

    // 生存者の割り当て
    var aList = document.getElementById('survivor-assign-list');
    aList.innerHTML = '';
    var unassignedRow = el('div', 'assign-row');
    unassignedRow.appendChild(el('span', 'assign-name', '未割り当て'));
    refs.unassigned = el('span');
    unassignedRow.appendChild(refs.unassigned);
    aList.appendChild(unassignedRow);
    Game.BUILDING_KEYS.forEach(function (key) {
      var row = el('div', 'assign-row');
      row.appendChild(el('span', 'assign-name', Game.BUILDING_DEFS[key].name));
      var minus = el('button', 'btn btn-tiny', '-');
      minus.dataset.action = 'unassign';
      minus.dataset.key = key;
      minus.setAttribute('aria-label', Game.BUILDING_DEFS[key].name + 'から外す');
      var count = el('span', 'assign-count');
      var plus = el('button', 'btn btn-tiny', '+');
      plus.dataset.action = 'assign';
      plus.dataset.key = key;
      plus.setAttribute('aria-label', Game.BUILDING_DEFS[key].name + 'に割り当てる');
      row.appendChild(minus);
      row.appendChild(count);
      row.appendChild(plus);
      aList.appendChild(row);
      refs.assign[key] = { row: row, minus: minus, count: count, plus: plus };
    });

    // 永続強化
    var uList = document.getElementById('prestige-upgrade-list');
    uList.innerHTML = '';
    Game.PRESTIGE_UPGRADE_KEYS.forEach(function (key) {
      var li = el('li', 'upgrade-item');
      var label = el('span');
      var btn = el('button', 'btn btn-tiny btn-cost');
      btn.dataset.action = 'upgrade';
      btn.dataset.key = key;
      li.appendChild(label);
      li.appendChild(btn);
      uList.appendChild(li);
      refs.upgrades[key] = { label: label, btn: btn };
    });

    // 実績
    var achList = document.getElementById('achievement-list');
    achList.innerHTML = '';
    Game.ACHIEVEMENT_DEFS.forEach(function (def) {
      var li = el('li', 'achievement-item');
      achList.appendChild(li);
      refs.achievements[def.id] = li;
    });
  }

  // ---------- 各パネルの更新 ----------

  function renderResources() {
    Game.RESOURCE_KEYS.forEach(function (key) {
      var r = refs.resources[key];
      var rate = (Game.lastRates && Game.lastRates[key]) || 0;
      setText(r.amount, Game.formatNumber(Game.state.resources[key]));
      setText(r.rate, key === 'power' ? '(余剰 ' + Game.formatNumber(rate) + ')' : Game.formatRate(rate));
    });
  }

  function renderClickArea() {
    setText(document.getElementById('click-amount'), Game.formatNumber(Game.getClickAmount()));
    setText(document.getElementById('click-level'), Game.state.clickLevel);
    var cost = Game.getClickUpgradeCost();
    setText(document.getElementById('click-upgrade-cost'), Game.formatNumber(cost));
    setDisabled(document.getElementById('btn-upgrade-click'), Game.state.resources.wood < cost);
  }

  function renderBuildings() {
    var state = Game.state;
    Game.BUILDING_KEYS.forEach(function (key) {
      var def = Game.BUILDING_DEFS[key];
      var r = refs.buildings[key];
      var unlocked = def.unlocked(state);
      setHidden(r.row, !unlocked);
      if (!unlocked) return;

      var level = state.buildings[key];
      var cost = Game.getBuildingCost(key);
      var bonus = Game.getSurvivorBonus(state, key);
      var parts = [];
      if (level > 0) {
        Object.keys(def.output).forEach(function (res) {
          parts.push('+' + Game.formatNumber(def.output[res] * level * bonus) + Game.RESOURCE_NAMES[res] + '/s');
        });
        Object.keys(def.consumes).forEach(function (res) {
          parts.push('-' + Game.formatNumber(def.consumes[res] * level) + Game.RESOURCE_NAMES[res] + '/s');
        });
      } else {
        parts.push('未建設');
      }
      var costText = Object.keys(cost).map(function (res) {
        return Game.formatNumber(cost[res]) + Game.RESOURCE_NAMES[res];
      }).join(' + ');

      setText(r.name, def.name + ' Lv.' + level);
      setText(r.detail, parts.join(' ') + ' / 次: ' + costText);
      setDisabled(r.btn, !Game.canAfford(cost));
    });
  }

  function renderSurvivors() {
    var state = Game.state;
    var cap = Game.getPopulationCap(state);
    setText(document.getElementById('survivor-count-text'), state.survivors.total + ' / ' + cap);
    var cost = Game.getSurvivorAcceptCost();
    setText(document.getElementById('survivor-cost'), Game.formatNumber(cost));
    setDisabled(document.getElementById('btn-accept-survivor'), state.survivors.total >= cap || state.resources.wood < cost);

    var unassigned = Game.getUnassignedSurvivors(state);
    setText(refs.unassigned, unassigned + '人');
    Game.BUILDING_KEYS.forEach(function (key) {
      var r = refs.assign[key];
      var assigned = state.survivors.assigned[key] || 0;
      setHidden(r.row, state.buildings[key] <= 0);
      setText(r.count, assigned);
      setDisabled(r.minus, assigned <= 0);
      setDisabled(r.plus, unassigned <= 0);
    });
  }

  function renderPrestige() {
    var state = Game.state;
    var req = Game.ESCAPE_REQUIREMENTS;
    setText(document.getElementById('prestige-requirements'),
      '必要資源 — 部品: ' + Game.formatNumber(state.resources.components) + ' / ' + Game.formatNumber(req.components)
      + ' ・ 金属: ' + Game.formatNumber(state.resources.metal) + ' / ' + Game.formatNumber(req.metal));

    var maxCarry = Math.min(Game.MAX_CARRY_SURVIVORS, state.survivors.total);
    if (Game.carrySelection > maxCarry) Game.carrySelection = maxCarry;
    setText(document.getElementById('carry-count'), Game.carrySelection);
    setDisabled(document.getElementById('carry-minus'), Game.carrySelection <= 0);
    setDisabled(document.getElementById('carry-plus'), Game.carrySelection >= maxCarry);

    setText(document.getElementById('knowledge-count'), Game.formatNumber(state.prestige.knowledge));
    var canJump = Game.canPrestige(state);
    var jumpBtn = document.getElementById('btn-prestige');
    setDisabled(jumpBtn, !canJump);
    setText(jumpBtn, canJump
      ? '脱出船を発進する(知識 +' + Game.calcKnowledgeGain(state) + ')'
      : '脱出船を発進する');

    Game.PRESTIGE_UPGRADE_KEYS.forEach(function (key) {
      var def = Game.PRESTIGE_UPGRADE_DEFS[key];
      var r = refs.upgrades[key];
      var level = state.prestige.upgrades[key];
      var maxed = level >= def.max;
      setText(r.label, def.name + ' (Lv.' + level + (maxed ? '/MAX' : '') + ')');
      if (maxed) {
        setText(r.btn, 'MAX');
        setDisabled(r.btn, true);
      } else {
        var cost = Game.getPrestigeUpgradeCost(key);
        setText(r.btn, cost);
        setDisabled(r.btn, state.prestige.knowledge < cost);
      }
    });
  }

  function renderAchievements() {
    Game.ACHIEVEMENT_DEFS.forEach(function (def) {
      var unlocked = !!Game.state.achievements[def.id];
      var li = refs.achievements[def.id];
      var cls = 'achievement-item' + (unlocked ? ' unlocked' : '');
      if (li.className !== cls) li.className = cls;
      setText(li, (unlocked ? '[済] ' : '[  ] ') + def.name + ' — ' + def.desc);
    });
  }

  function renderHeader() {
    setText(document.getElementById('planet-count'), '第' + (Game.state.prestige.count + 1) + '惑星');
  }

  function renderSaveStatus(text) {
    setText(document.getElementById('save-status'), text || '');
  }
  Game.renderSaveStatus = renderSaveStatus;

  Game.render = function () {
    if (!refs) buildUI();
    renderHeader();
    renderResources();
    renderClickArea();
    renderBuildings();
    renderSurvivors();
    renderPrestige();
    renderAchievements();
  };

  // ---------- モーダル(セーブコード入出力 / 確認ダイアログ) ----------
  // window.confirm / alert はサンドボックス環境(アーティファクト等)で
  // ブロックされることがあるため使わず、ページ内のモーダルで代替する。

  var modal = { mode: null, onConfirm: null };

  function openModal(options) {
    modal.mode = options.mode;
    modal.onConfirm = options.onConfirm || null;
    var textarea = document.getElementById('modal-textarea');
    var note = document.getElementById('modal-note');
    setText(document.getElementById('modal-title'), options.title);
    setText(note, options.note || '');
    note.classList.remove('is-error');
    setText(document.getElementById('modal-confirm'), options.confirmLabel || 'OK');
    setText(document.getElementById('modal-cancel'), options.cancelLabel || '閉じる');
    document.getElementById('modal-confirm').classList.toggle('btn-danger', !!options.danger);

    textarea.hidden = options.textarea === undefined;
    textarea.readOnly = !!options.readOnly;
    textarea.value = options.textarea || '';
    document.getElementById('modal-overlay').hidden = false;
    if (!textarea.hidden) {
      textarea.focus();
      if (options.readOnly) textarea.select();
    } else {
      document.getElementById('modal-confirm').focus();
    }
  }

  function closeModal() {
    document.getElementById('modal-overlay').hidden = true;
    modal.mode = null;
    modal.onConfirm = null;
  }

  function showModalError(message) {
    var note = document.getElementById('modal-note');
    setText(note, message);
    note.classList.add('is-error');
  }

  function confirmAction(options) {
    openModal({
      mode: 'confirm',
      title: options.title,
      note: options.message,
      confirmLabel: options.confirmLabel,
      cancelLabel: 'やめる',
      danger: options.danger,
      onConfirm: function () {
        options.onConfirm();
        closeModal();
      },
    });
  }

  function importSaveCode(code) {
    var imported;
    try {
      imported = Game.decodeSaveCode(code);
    } catch (e) {
      showModalError('読み込めませんでした: ' + e.message + '。コードを最後まで貼り付けたか確認してください。');
      return;
    }
    // 実績・統計はこの端末のものを維持する(ハイブリッド仕様)
    imported.achievements = Object.assign({}, Game.state.achievements);
    imported.stats = Object.assign({}, Game.state.stats);
    Game.state = imported;
    Game.carrySelection = 0;
    var offlineSec = Game.applyOfflineProgress(Game.state);
    Game.saveToLocalStorage();
    Game.render();
    Game.addLog('セーブコードを読み込みました' + (offlineSec > 0 ? '(放置分 ' + Math.floor(offlineSec / 60) + '分 を反映)' : ''));
    closeModal();
  }

  // ---------- イベントバインド ----------

  function handleDelegatedClick(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    var key = btn.dataset.key;
    switch (btn.dataset.action) {
      case 'build': Game.buyBuilding(key); break;
      case 'assign': Game.assignSurvivor(key); break;
      case 'unassign': Game.unassignSurvivor(key); break;
      case 'upgrade': Game.buyPrestigeUpgrade(key); break;
    }
  }

  Game.initUI = function () {
    buildUI();
    ['building-list', 'survivor-assign-list', 'prestige-upgrade-list'].forEach(function (id) {
      document.getElementById(id).addEventListener('click', handleDelegatedClick);
    });

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
      var carry = Game.carrySelection;
      confirmAction({
        title: '脱出船を発進しますか?',
        message: 'この惑星の建物と資源はすべて失われます。知識ポイント +' + Game.calcKnowledgeGain(Game.state)
          + ' と、同行させる生存者 ' + carry + '人 は次の惑星へ引き継がれます。',
        confirmLabel: '発進する',
        onConfirm: function () {
          Game.doPrestige(carry);
          Game.carrySelection = 0;
          Game.saveToLocalStorage();
        },
      });
    });

    document.getElementById('btn-export').addEventListener('click', function () {
      openModal({
        mode: 'export',
        title: 'セーブコード',
        textarea: Game.encodeSaveCode(Game.state),
        readOnly: true,
        note: 'このコードを控えておけば、別の端末で「コードを読み込む」から続きを遊べます。実績・統計はコードに含まれず、端末ごとに記録されます。',
        confirmLabel: 'コピーして閉じる',
        onConfirm: function () {
          var text = document.getElementById('modal-textarea').value;
          var done = function () { Game.addLog('セーブコードをコピーしました'); closeModal(); };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () {
              showModalError('自動コピーできませんでした。上のコードを長押し(または選択)してコピーしてください。');
            });
          } else {
            showModalError('自動コピーに対応していない環境です。上のコードを選択してコピーしてください。');
          }
        },
      });
    });

    document.getElementById('btn-import').addEventListener('click', function () {
      openModal({
        mode: 'import',
        title: 'セーブコードを読み込む',
        textarea: '',
        note: '別の端末で発行したコードを貼り付けてください。今の進行状況は上書きされます。',
        confirmLabel: '読み込む',
        onConfirm: function () { importSaveCode(document.getElementById('modal-textarea').value); },
      });
    });

    document.getElementById('modal-confirm').addEventListener('click', function () {
      if (modal.onConfirm) modal.onConfirm(); else closeModal();
    });
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', function (e) {
      if (e.target.id === 'modal-overlay') closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.mode) closeModal();
    });

    document.getElementById('btn-reset').addEventListener('click', function () {
      confirmAction({
        title: '最初からやり直しますか?',
        message: '惑星ジャンプの回数・知識ポイント・実績を含め、この端末の記録がすべて消えます。元には戻せません。',
        confirmLabel: '消去してやり直す',
        danger: true,
        onConfirm: function () {
          Game.state = Game.createInitialState();
          Game.carrySelection = 0;
          Game.saveToLocalStorage();
          Game.render();
          Game.addLog('コロニーの記録を消去し、最初からやり直します。');
        },
      });
    });
  };
})(window.Game = window.Game || {});
