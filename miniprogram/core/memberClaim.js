const storage = require('./storage');
const modeHelper = require('./mode');

function playerId(player) {
  return String(player && (player.id || player.playerId || player._id) || '').trim();
}

function getClaimCandidates(tournament, openid) {
  if (!tournament || tournament.status !== 'draft') return [];
  const players = Array.isArray(tournament.players) ? tournament.players : [];
  if (openid && players.some(p => playerId(p) === openid)) return [];
  return players.filter(p => p && typeof p === 'object'
    && (String(p.type || '').toLowerCase() === 'guest' || playerId(p).startsWith('guest_')));
}

function candidateLabel(player, tournament, index) {
  const id = playerId(player);
  const pair = (tournament.pairTeams || []).find(t => (t.playerIds || []).includes(id));
  const partnerIds = pair ? pair.playerIds.filter(pid => pid !== id) : [];
  const partner = (tournament.players || []).filter(p => partnerIds.includes(playerId(p))).map(p => p.name).join('、');
  return `${index + 1}. ${String(player.name || '未命名球友')}${player.squad ? `（${player.squad}队）` : ''}${partner ? ` / 搭档${partner}` : ''}`;
}

// Selection is not consent. The second dialog is required before sending any claim.
async function chooseMemberClaim(tournament, options = {}) {
  const openid = String(options.openid || storage.get('openid', '') || '').trim();
  const candidates = getClaimCandidates(tournament, openid);
  if (!candidates.length) return { action: 'join' };
  const limit = modeHelper.getTournamentPlayerLimit(tournament);
  const full = limit > 0 && (tournament.players || []).length >= limit;
  let offset = 0;
  while (offset >= 0) {
    const page = candidates.slice(offset, offset + 4);
    const labels = page.map((p, index) => candidateLabel(p, tournament, offset + index));
    const nextPage = candidates.length > 4;
    if (nextPage) labels.push('查看其他待认领成员');
    labels.push(full ? '取消认领' : '不认领，以新成员加入');
    let selected;
    try {
      selected = await new Promise((resolve, reject) => wx.showActionSheet({ itemList: labels, success: resolve, fail: reject }));
    } catch (_) { return null; }
    const index = Number(selected.tapIndex);
    if (!Number.isInteger(index) || index < 0 || index >= labels.length) return null;
    if (nextPage && index === page.length) {
      offset = offset + 4 >= candidates.length ? 0 : offset + 4;
      continue;
    }
    if (index === labels.length - 1) return full ? null : { action: 'join' };
    const target = page[index];
    const label = candidateLabel(target, tournament, offset + index);
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '确认认领参赛位置',
      content: `你确认「${label}」是你本人吗？确认后会绑定你的账号，保留原队别、搭档和赛程位置。请勿认领他人。`,
      confirmText: '这是我', cancelText: '取消',
      success: res => resolve(res.confirm === true), fail: () => resolve(false)
    }));
    if (!confirmed) return null;
    return { action: 'claim_guest', claimGuestId: playerId(target), claimConfirmed: true,
      expectedVersion: Number(tournament.version) || 1 };
  }
}

module.exports = { getClaimCandidates, candidateLabel, chooseMemberClaim };
