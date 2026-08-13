function cleanId(value) {
  return String(value || '').trim();
}

function cleanName(value, fallback = '球友') {
  return String(value || '').trim() || fallback;
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function decorateNet(row) {
  const item = row;
  item.netText = item.net > 0 ? `+${item.net}` : String(item.net);
  item.netClass = item.net > 0 ? 'is-positive' : item.net < 0 ? 'is-negative' : 'is-even';
  return item;
}

function compareLedgerRows(a, b) {
  return b.net - a.net || b.won - a.won || a.name.localeCompare(b.name);
}

function deriveLedger(players = [], entries = []) {
  const rows = (Array.isArray(players) ? players : []).map((player, index) => ({
    id: cleanId(player && player.id),
    name: String(player && player.name || '').trim() || `球友${index + 1}`,
    initial: String(player && player.name || '球').trim().slice(0, 1),
    won: 0,
    treat: 0,
    net: 0
  }));
  const byId = new Map(rows.map((item) => [item.id, item]));

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    if (entry.type === 'game') {
      const units = Number(entry.unitsPerPlayer || 0);
      (Array.isArray(entry.winnerIds) ? entry.winnerIds : []).forEach((id) => {
        const row = byId.get(cleanId(id));
        if (row) row.won += units;
      });
      (Array.isArray(entry.loserIds) ? entry.loserIds : []).forEach((id) => {
        const row = byId.get(cleanId(id));
        if (row) row.treat += units;
      });
      return;
    }
    if (entry.type === 'transfer') {
      const units = Number(entry.units || 0);
      const from = byId.get(cleanId(entry.fromPlayerId));
      const to = byId.get(cleanId(entry.toPlayerId));
      if (from) from.treat += units;
      if (to) to.won += units;
    }
  });

  rows.forEach((item) => {
    item.net = item.won - item.treat;
    decorateNet(item);
  });
  return rows.sort(compareLedgerRows);
}

function describeEntry(entry, participantMap) {
  const names = (ids) => (Array.isArray(ids) ? ids : []).map((id) => participantMap[cleanId(id)] || '球友').join('、');
  if (entry && entry.type === 'game') {
    return `${names(entry.winnerIds)} 胜 ${names(entry.loserIds)} · 每人 ${Number(entry.unitsPerPlayer || 0)} 水`;
  }
  if (entry && entry.type === 'transfer') {
    return `${participantMap[cleanId(entry.fromPlayerId)] || '球友'} 请 ${participantMap[cleanId(entry.toPlayerId)] || '球友'} · ${Number(entry.units || 0)} 水`;
  }
  return '';
}

function buildParticipantMap(participants = []) {
  if (!Array.isArray(participants)) {
    return participants && typeof participants === 'object' ? { ...participants } : {};
  }
  return participants.reduce((result, participant) => {
    const id = cleanId(participant && (participant.id || participant.participantId));
    if (id) result[id] = participant;
    return result;
  }, {});
}

function buildParticipantNameMap(participants = []) {
  const participantsById = buildParticipantMap(participants);
  return Object.keys(participantsById).reduce((result, id) => {
    const participant = participantsById[id];
    result[id] = typeof participant === 'string'
      ? cleanName(participant)
      : cleanName(participant && participant.name);
    return result;
  }, {});
}

function buildV2LedgerRows(round = {}, participants = []) {
  const snapshot = Array.isArray(round && round.participantSnapshot)
    ? round.participantSnapshot
    : [];
  const ledger = Array.isArray(round && round.ledger) ? round.ledger : [];
  const participantMeta = buildParticipantMap(participants);
  const snapshotById = buildParticipantMap(snapshot);
  const ledgerById = ledger.reduce((result, item) => {
    const id = cleanId(item && (item.participantId || item.id));
    if (id) result[id] = item;
    return result;
  }, {});
  const ids = [];
  const seen = new Set();

  snapshot.forEach((participant) => {
    const id = cleanId(participant && (participant.id || participant.participantId));
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  ledger.forEach((item) => {
    const id = cleanId(item && (item.participantId || item.id));
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });

  return ids.map((id, index) => {
    const ledgerRow = ledgerById[id] || {};
    const snapshotParticipant = snapshotById[id] || {};
    const meta = participantMeta[id] || {};
    const won = toInteger(ledgerRow.won);
    const treat = toInteger(ledgerRow.treat);
    const net = Number.isFinite(Number(ledgerRow.net))
      ? toInteger(ledgerRow.net)
      : won - treat;
    const name = cleanName(
      snapshotParticipant.name || meta.name,
      `球友${index + 1}`
    );
    return decorateNet({
      id,
      participantId: id,
      name,
      initial: name.slice(0, 1),
      won,
      treat,
      net,
      claimed: meta.claimed === true,
      isViewer: meta.isViewer === true
    });
  }).sort(compareLedgerRows);
}

function entryIdOf(entry) {
  return cleanId(entry && (entry.id || entry.entryId || entry._id));
}

function entryLifecycleRank(entry) {
  const status = cleanId(entry && entry.status).toLowerCase();
  if (status === 'corrected' || status === 'reversed' || status === 'applied') return 2;
  if (status === 'active') return 1;
  return 0;
}

function entryCategory(entry) {
  const category = cleanId(entry && entry.category).toLowerCase();
  if (category === 'game' || category === 'direct') return category;
  const eventType = cleanId(entry && entry.eventType).toLowerCase();
  return eventType.includes('game') ? 'game' : 'direct';
}

function describeV2Payload(category, payload, participantMap) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const names = buildParticipantNameMap(participantMap);
  const nameOf = (id) => names[cleanId(id)] || '球友';
  if (category === 'game') {
    const winners = (Array.isArray(data.winnerIds) ? data.winnerIds : []).map(nameOf).join('、');
    const losers = (Array.isArray(data.loserIds) ? data.loserIds : []).map(nameOf).join('、');
    return `${winners || '球友'} 胜 ${losers || '球友'} · 每人 ${toInteger(data.unitsPerPlayer)} 水`;
  }
  return `${nameOf(data.fromPlayerId)} 请 ${nameOf(data.toPlayerId)} · ${toInteger(data.units)} 水`;
}

function statusLabelOf(status) {
  const value = cleanId(status).toLowerCase();
  if (value === 'corrected') return '已更正';
  if (value === 'reversed') return '已撤销';
  return '';
}

function describeV2Entry(entry, participants = []) {
  if (!entry || typeof entry !== 'object') return '';
  const category = entryCategory(entry);
  const eventType = cleanId(entry.eventType).toLowerCase();
  const actorName = cleanName(entry.actorNameSnapshot);
  if (eventType === 'entry_reversed') {
    return `${actorName}撤销了这条${category === 'game' ? '对局' : '单记'}`;
  }
  const description = describeV2Payload(category, entry.payload || entry, participants);
  if (eventType === 'entry_corrected') return `${actorName}更正为：${description}`;
  return description;
}

function mergeV2FeedEntries(current = [], incoming = []) {
  const byId = new Map();
  [current, incoming].forEach((group) => {
    (Array.isArray(group) ? group : []).forEach((entry) => {
      const id = entryIdOf(entry);
      if (!id || !entry || typeof entry !== 'object') return;
      const existing = byId.get(id);
      if (existing && entryLifecycleRank(existing) > entryLifecycleRank(entry)) return;
      byId.set(id, entry.id ? { ...entry } : { ...entry, id });
    });
  });
  return Array.from(byId.values()).sort((a, b) => (
    toInteger(b.seq, -1) - toInteger(a.seq, -1)
    || toInteger(b.createdAtMs, -1) - toInteger(a.createdAtMs, -1)
    || entryIdOf(a).localeCompare(entryIdOf(b))
  ));
}

function canManageV2Entry(entry, options, capabilityName) {
  const context = options && typeof options === 'object' ? options : {};
  const viewer = context.viewer && typeof context.viewer === 'object' ? context.viewer : {};
  const capabilities = context.capabilities && typeof context.capabilities === 'object'
    ? context.capabilities
    : {};
  const eventType = cleanId(entry && entry.eventType).toLowerCase();
  const viewerParticipantId = cleanId(viewer.participantId || viewer.viewerParticipantId);
  const rootCreatorId = cleanId(entry && entry.rootCreatedByParticipantId);
  const isCurrentActiveVersion = cleanId(entry && entry.status).toLowerCase() === 'active'
    && eventType !== 'entry_reversed';
  const canHandleCreator = !!rootCreatorId && (
    viewer.isOwner === true
    || cleanId(viewer.role).toLowerCase() === 'owner'
    || (!!viewerParticipantId && viewerParticipantId === rootCreatorId)
  );
  return cleanId(context.roundStatus).toLowerCase() === 'active'
    && isCurrentActiveVersion
    && canHandleCreator
    && capabilities[capabilityName] === true;
}

function buildV2FeedItems(entries = [], participants = [], options = {}) {
  return mergeV2FeedEntries([], entries).map((entry) => {
    const category = entryCategory(entry);
    const eventType = cleanId(entry.eventType).toLowerCase();
    const id = entryIdOf(entry);
    return {
      ...entry,
      id,
      entryId: id,
      category,
      typeLabel: category === 'game' ? '对局' : '单记',
      description: describeV2Entry(entry, participants),
      actorName: cleanName(entry.actorNameSnapshot),
      statusLabel: statusLabelOf(entry.status),
      isCorrection: eventType === 'entry_corrected',
      isReversal: eventType === 'entry_reversed',
      canModify: canManageV2Entry(entry, options, 'canCorrect'),
      canReverse: canManageV2Entry(entry, options, 'canReverse')
    };
  });
}

module.exports = {
  deriveLedger,
  describeEntry,
  buildParticipantNameMap,
  buildV2LedgerRows,
  describeV2Entry,
  mergeV2FeedEntries,
  buildV2FeedItems
};
