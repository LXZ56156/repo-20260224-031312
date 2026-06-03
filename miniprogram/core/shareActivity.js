const flow = require('./uxFlow');
const systemInfo = require('./systemInfo');

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

function resolveDynamicShareUnavailableReason(tournament) {
  if (String(tournament && tournament.status || '').trim() !== 'draft') return 'not_draft';
  if (resolveRoomLimit(tournament) <= 0) return 'player_limit_required';
  return '';
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

function validateShareMenuTemplateInfo(templateInfo) {
  const source = templateInfo && typeof templateInfo === 'object' ? templateInfo : {};
  if (!String(source.templateId || '').trim()) return false;
  const params = Array.isArray(source.parameterList) ? source.parameterList : [];
  const values = {};
  params.forEach((item) => {
    const name = String(item && item.name || '').trim();
    if (name) values[name] = item && item.value;
  });
  return typeof values.member_count === 'string' &&
    typeof values.room_limit === 'string' &&
    Number(values.room_limit) > 0;
}

function isShowShareMenuSupported() {
  return typeof wx !== 'undefined' && !!wx && typeof wx.showShareMenu === 'function';
}

function isUpdateShareMenuSupported() {
  return typeof wx !== 'undefined' && !!wx && typeof wx.updateShareMenu === 'function';
}

function updateShareMenu(options = {}) {
  if (!isUpdateShareMenuSupported()) {
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

function buildShowShareMenuPayload(options = {}) {
  const payload = {
    withShareTicket: true,
    ...(options && typeof options === 'object' ? options : {})
  };
  const platform = String(systemInfo.getDeviceBaseInfo().platform || '').trim().toLowerCase();
  if (platform !== 'android') delete payload.menus;
  return payload;
}

function showShareMenuBestEffort(options = {}) {
  if (!isShowShareMenuSupported()) {
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
      ...buildShowShareMenuPayload(options),
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
  resolveDynamicShareUnavailableReason,
  buildShareMenuTemplateInfo,
  validateShareMenuTemplateInfo,
  isShowShareMenuSupported,
  isUpdateShareMenuSupported,
  updateShareMenu,
  buildShowShareMenuPayload,
  showShareMenuBestEffort,
  disableDynamicShareBestEffort
};
