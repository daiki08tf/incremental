/* =========================================================
   survivors.js
   生存者の受け入れと建物への割り当て(簡略版)。
   ========================================================= */
(function (Game) {
  'use strict';

  Game.getPopulationCap = function (state) {
    return Game.BASE_POPULATION_CAP + state.prestige.upgrades.populationCap;
  };

  Game.getSurvivorAcceptCost = function () {
    var n = Game.state.survivors.total;
    return Math.ceil(20 * Math.pow(1.5, n));
  };

  Game.acceptSurvivor = function () {
    var state = Game.state;
    var cap = Game.getPopulationCap(state);
    if (state.survivors.total >= cap) return false;
    var cost = Game.getSurvivorAcceptCost();
    if (state.resources.wood < cost) return false;
    state.resources.wood -= cost;
    state.survivors.total += 1;
    Game.checkAchievements();
    Game.render();
    return true;
  };

  Game.getUnassignedSurvivors = function (state) {
    var assignedTotal = Game.BUILDING_KEYS.reduce(function (sum, key) {
      return sum + (state.survivors.assigned[key] || 0);
    }, 0);
    return state.survivors.total - assignedTotal;
  };

  Game.assignSurvivor = function (buildingKey) {
    var state = Game.state;
    if (state.buildings[buildingKey] <= 0) return false;
    if (Game.getUnassignedSurvivors(state) <= 0) return false;
    state.survivors.assigned[buildingKey] = (state.survivors.assigned[buildingKey] || 0) + 1;
    Game.render();
    return true;
  };

  Game.unassignSurvivor = function (buildingKey) {
    var state = Game.state;
    if ((state.survivors.assigned[buildingKey] || 0) <= 0) return false;
    state.survivors.assigned[buildingKey] -= 1;
    Game.render();
    return true;
  };
})(window.Game = window.Game || {});
