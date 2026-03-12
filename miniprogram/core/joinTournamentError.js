const cloud = require('./cloud');

const CODE_TO_MESSAGE = {
  TOURNAMENT_ID_REQUIRED: '未识别到比赛，请重新打开链接',
  TOURNAMENT_NOT_FOUND: '比赛已不存在，请确认分享链接是否有效',
  JOIN_DRAFT_ONLY: '比赛当前不可加入，可先查看比赛信息',
  PROFILE_MINIMUM_REQUIRED: '请先完善昵称、头像和性别',
  VERSION_CONFLICT: '并发冲突，请重试',
  JOIN_FAILED: '加入失败，请稍后重试'
};

const ACTION_CODE_TO_MESSAGE = {
  profile_update: {
    JOIN_DRAFT_ONLY: '比赛已开始，当前不可修改参赛信息'
  }
};

function getJoinFailureCode(input) {
  return String(
    (input && (input.joinCode || input.code || (input.result && input.result.code))) || ''
  ).trim().toUpperCase();
}

function getRawJoinFailureMessage(input, fallbackMessage = '加入失败，请稍后重试') {
  return String(
    (input && (input.joinRawMessage || input.message || input.errMsg || (input.result && input.result.message))) || fallbackMessage
  ).trim() || fallbackMessage;
}

function mapJoinFailureMessage(code, rawMessage, fallbackMessage, options = {}) {
  const action = String((options && options.action) || '').trim().toLowerCase();
  const actionMessage = ACTION_CODE_TO_MESSAGE[action] && ACTION_CODE_TO_MESSAGE[action][code];
  return actionMessage || CODE_TO_MESSAGE[code] || rawMessage || fallbackMessage;
}

function normalizeJoinFailure(input, fallbackMessage = '加入失败，请稍后重试', options = {}) {
  const code = getJoinFailureCode(input);
  const rawMessage = getRawJoinFailureMessage(input, fallbackMessage);
  const err = input instanceof Error ? input : new Error(rawMessage);
  err.joinRawMessage = rawMessage;
  err.message = mapJoinFailureMessage(code, rawMessage, fallbackMessage, options);
  if (code) {
    err.code = code;
    err.joinCode = code;
  }
  return err;
}

function isConflictResult(input) {
  return getJoinFailureCode(input) === 'VERSION_CONFLICT';
}

function resolveJoinFailureMessage(input, fallbackMessage = '加入失败，请稍后重试', options = {}) {
  const code = getJoinFailureCode(input);
  const rawMessage = getRawJoinFailureMessage(input, fallbackMessage);
  if (code) return mapJoinFailureMessage(code, rawMessage, fallbackMessage, options);
  const err = normalizeJoinFailure(input, fallbackMessage, options);
  return cloud.getUnifiedErrorMessage(err, fallbackMessage);
}

module.exports = {
  getJoinFailureCode,
  isConflictResult,
  normalizeJoinFailure,
  resolveJoinFailureMessage
};
