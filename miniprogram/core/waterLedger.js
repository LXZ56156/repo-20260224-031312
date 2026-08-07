function cleanId(value) {
  return String(value || '').trim();
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
    item.netText = item.net > 0 ? `+${item.net}` : String(item.net);
    item.netClass = item.net > 0 ? 'is-positive' : item.net < 0 ? 'is-negative' : 'is-even';
  });
  return rows.sort((a, b) => b.net - a.net || b.won - a.won || a.name.localeCompare(b.name));
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

module.exports = { deriveLedger, describeEntry };
