const CODES = {
  INVALID_ACTION: 'INVALID_ACTION',
  TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
  TEAM_SIZE_INVALID: 'TEAM_SIZE_INVALID',
  INVALID_PLAYER: 'INVALID_PLAYER',
  DUPLICATE_PLAYER: 'DUPLICATE_PLAYER'
};

function normalizeAction(action) {
  const v = String(action || '').trim().toLowerCase();
  if (v === 'create' || v === 'update' || v === 'delete' || v === 'reorder' || v === 'auto_generate') return v;
  return '';
}

function normalizeName(name, fallback = '') {
  const v = String(name || '').replace(/[\r\n\t]+/g, ' ').trim();
  if (v) return v.slice(0, 20);
  return fallback;
}

function normalizePlayerIds(playerIds) {
  const ids = Array.isArray(playerIds) ? playerIds : [];
  const out = [];
  for (const idRaw of ids) {
    const id = String(idRaw || '').trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
    if (out.length >= 2) break;
  }
  return out;
}

function buildTeamName(index) {
  return `第${index + 1}队`;
}

function buildValidPlayerIds(players) {
  const out = [];
  const list = Array.isArray(players) ? players : [];
  for (const item of list) {
    const id = String(item && item.id || '').trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function sanitizeExistingTeams(teamsRaw, validPlayerIds) {
  const teams = Array.isArray(teamsRaw) ? teamsRaw : [];
  const validSet = new Set(Array.isArray(validPlayerIds) ? validPlayerIds : []);
  const usedSet = new Set();
  const out = [];
  for (let i = 0; i < teams.length; i += 1) {
    const item = teams[i] || {};
    const id = String(item.id || '').trim() || `pair_${Date.now()}_${i}`;
    const playerIds = normalizePlayerIds(item.playerIds);
    if (playerIds.length !== 2) continue;
    if (!validSet.has(playerIds[0]) || !validSet.has(playerIds[1])) continue;
    if (usedSet.has(playerIds[0]) || usedSet.has(playerIds[1])) continue;
    usedSet.add(playerIds[0]);
    usedSet.add(playerIds[1]);
    out.push({
      id,
      name: normalizeName(item.name, buildTeamName(out.length)),
      playerIds,
      locked: true
    });
  }
  return out;
}

function autoGenerateTeams(players) {
  const ids = buildValidPlayerIds(players);
  const pairTeams = [];
  for (let i = 0; i + 1 < ids.length; i += 2) {
    pairTeams.push({
      id: `pair_${Date.now()}_${i}`,
      name: buildTeamName(pairTeams.length),
      playerIds: [ids[i], ids[i + 1]],
      locked: true
    });
  }
  const warnings = [];
  if (ids.length % 2 === 1) warnings.push('存在1名成员未组队，可手动补齐。');
  return { pairTeams, warnings };
}

function fail(code, message) {
  return { ok: false, code, message };
}

function buildUsedSet(teams, excludeTeamId = '') {
  const out = new Set();
  const list = Array.isArray(teams) ? teams : [];
  const exclude = String(excludeTeamId || '').trim();
  for (const item of list) {
    if (!item) continue;
    if (exclude && String(item.id || '') === exclude) continue;
    const ids = normalizePlayerIds(item.playerIds);
    for (const id of ids) out.add(id);
  }
  return out;
}

function validateTeamPlayers(playerIds, validSet, usedSet) {
  const ids = normalizePlayerIds(playerIds);
  if (ids.length !== 2) {
    return fail(CODES.TEAM_SIZE_INVALID, '每队必须且只能选择2名成员');
  }
  if (!validSet.has(ids[0]) || !validSet.has(ids[1])) {
    return fail(CODES.INVALID_PLAYER, '队伍成员必须是有效参赛成员');
  }
  if (usedSet.has(ids[0]) || usedSet.has(ids[1])) {
    return fail(CODES.DUPLICATE_PLAYER, '成员已在其他队伍中');
  }
  return { ok: true, playerIds: ids };
}

function applyAction({ action, teams, players, validPlayerIds, event }) {
  const modeAction = normalizeAction(action);
  if (!modeAction) return fail(CODES.INVALID_ACTION, 'action 不支持');
  const safeTeams = Array.isArray(teams) ? teams.slice() : [];
  const validSet = new Set(Array.isArray(validPlayerIds) ? validPlayerIds : buildValidPlayerIds(players));
  const payload = event && typeof event === 'object' ? event : {};

  if (modeAction === 'auto_generate') {
    const generated = autoGenerateTeams(players);
    return { ok: true, pairTeams: generated.pairTeams, warnings: generated.warnings };
  }

  if (modeAction === 'create') {
    const usedSet = buildUsedSet(safeTeams);
    const check = validateTeamPlayers(payload.playerIds, validSet, usedSet);
    if (!check.ok) return check;
    const nextTeams = safeTeams.concat({
      id: `pair_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      name: normalizeName(payload.name, buildTeamName(safeTeams.length)),
      playerIds: check.playerIds,
      locked: true
    });
    return { ok: true, pairTeams: nextTeams };
  }

  if (modeAction === 'update') {
    const teamId = String(payload.teamId || '').trim();
    if (!teamId) return fail(CODES.TEAM_NOT_FOUND, '队伍不存在');
    const idx = safeTeams.findIndex((item) => String(item && item.id || '') === teamId);
    if (idx < 0) return fail(CODES.TEAM_NOT_FOUND, '队伍不存在');
    const current = safeTeams[idx] || {};
    const desiredIds = payload.playerIds === undefined
      ? normalizePlayerIds(current.playerIds)
      : normalizePlayerIds(payload.playerIds);
    if (payload.playerIds !== undefined && desiredIds.length !== 2) {
      return fail(CODES.TEAM_SIZE_INVALID, '每队必须且只能选择2名成员');
    }
    const usedSet = buildUsedSet(safeTeams, teamId);
    const check = validateTeamPlayers(desiredIds, validSet, usedSet);
    if (!check.ok) return check;
    const nextTeams = safeTeams.slice();
    nextTeams[idx] = {
      ...current,
      name: normalizeName(payload.name, current.name || buildTeamName(idx)),
      playerIds: check.playerIds,
      locked: true
    };
    return { ok: true, pairTeams: nextTeams };
  }

  if (modeAction === 'delete') {
    const teamId = String(payload.teamId || '').trim();
    if (!teamId) return fail(CODES.TEAM_NOT_FOUND, '队伍不存在');
    return {
      ok: true,
      pairTeams: safeTeams.filter((item) => String(item && item.id || '') !== teamId)
    };
  }

  if (modeAction === 'reorder') {
    const teamOrder = Array.isArray(payload.teamOrder) ? payload.teamOrder.map((id) => String(id || '').trim()) : [];
    if (!teamOrder.length) return { ok: true, pairTeams: safeTeams };
    const orderMap = {};
    teamOrder.forEach((id, idx) => { orderMap[id] = idx; });
    const nextTeams = safeTeams.slice().sort((a, b) => {
      const ia = Object.prototype.hasOwnProperty.call(orderMap, a.id) ? orderMap[a.id] : 9999;
      const ib = Object.prototype.hasOwnProperty.call(orderMap, b.id) ? orderMap[b.id] : 9999;
      if (ia !== ib) return ia - ib;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return { ok: true, pairTeams: nextTeams };
  }

  return fail(CODES.INVALID_ACTION, 'action 不支持');
}

module.exports = {
  CODES,
  normalizeAction,
  normalizeName,
  normalizePlayerIds,
  buildTeamName,
  buildValidPlayerIds,
  sanitizeExistingTeams,
  autoGenerateTeams,
  applyAction
};
