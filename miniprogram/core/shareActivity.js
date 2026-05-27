const flow = require('./uxFlow');

const START_TEMPLATE_ID = '21B034D08C5615B9889CE362BB957B1EE69A584B';

function resolveRoomLimit(tournament) {
  const direct = Number(tournament && tournament.playerLimit);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);
  const fromMode = Number(flow.getRotationPlayerLimit(tournament || {}));
  if (Number.isFinite(fromMode) && fromMode > 0) return Math.floor(fromMode);
  return 0;
}

function countPlayers(tournament) {
  if (Array.isArray(tournament && tournament.players)) return tournament.players.length;
  if (Array.isArray(tournament && tournament.playerIds)) return tournament.playerIds.length;
  return 0;
}

function shouldUseDynamicShare(tournament) {
  return String(tournament && tournament.status || '').trim() === 'draft' && resolveRoomLimit(tournament) > 0;
}

function buildShareMenuTemplateInfo(tournament) {
  return {
    templateId: START_TEMPLATE_ID,
    parameterList: [
      { name: 'member_count', value: String(countPlayers(tournament)) },
      { name: 'room_limit', value: String(resolveRoomLimit(tournament)) }
    ]
  };
}

function updateShareMenu(options = {}) {
  if (typeof wx === 'undefined' || !wx || typeof wx.updateShareMenu !== 'function') {
    return Promise.resolve(false);
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      if (ok) resolve(value);
      else reject(value);
    };
    const payload = {
      ...options,
      success: (res) => finish(true, res),
      fail: (err) => finish(false, err)
    };
    try {
      const maybePromise = wx.updateShareMenu(payload);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then((res) => finish(true, res), (err) => finish(false, err));
      }
    } catch (err) {
      finish(false, err);
    }
  });
}

function showShareMenuBestEffort() {
  if (typeof wx === 'undefined' || !wx || typeof wx.showShareMenu !== 'function') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(!!ok);
    };
    const payload = {
      withShareTicket: true,
      success: () => finish(true),
      fail: () => finish(false)
    };
    try {
      const maybePromise = wx.showShareMenu(payload);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(() => finish(true), () => finish(false));
      }
    } catch (_) {
      finish(false);
    }
  });
}

function disableDynamicShareBestEffort() {
  updateShareMenu({ isUpdatableMessage: false }).catch(() => {});
}

module.exports = {
  START_TEMPLATE_ID,
  resolveRoomLimit,
  countPlayers,
  shouldUseDynamicShare,
  buildShareMenuTemplateInfo,
  updateShareMenu,
  showShareMenuBestEffort,
  disableDynamicShareBestEffort
};
