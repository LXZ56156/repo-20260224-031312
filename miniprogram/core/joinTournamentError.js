const cloud = require('./cloud');

const CODE_TO_MESSAGE = {
  TOURNAMENT_ID_REQUIRED: '未识别到比赛，请重新打开链接',
  TOURNAMENT_NOT_FOUND: '比赛已不存在，请确认分享链接是否有效',
  JOIN_DRAFT_ONLY: '比赛当前不可加入，可先查看赛况或结果',
  VERSION_CONFLICT: '并发冲突，请重试',
  JOIN_FAILED: '加入失败，请稍后重试'
};

function getJoinFailureCode(input) {
  return String(
    (input && (input.joinCode || input.code || (input.result && input.result.code))) || ''
  ).trim().toUpperCase();
}

function normalizeJoinFailure(input, fallbackMessage = '加入失败，请稍后重试') {
  const code = getJoinFailureCode(input);
  const rawMessage = String(
    (input && (input.message || input.errMsg || (input.result && input.result.message))) || fallbackMessage
  ).trim() || fallbackMessage;
  const err = input instanceof Error ? input : new Error(rawMessage);
  const mappedMessage = CODE_TO_MESSAGE[code];
  err.message = mappedMessage || rawMessage || fallbackMessage;
  if (code) {
    err.code = code;
    err.joinCode = code;
  }
  return err;
}

function resolveJoinFailureMessage(input, fallbackMessage = '加入失败，请稍后重试') {
  const err = normalizeJoinFailure(input, fallbackMessage);
  if (getJoinFailureCode(err)) return err.message || fallbackMessage;
  return cloud.getUnifiedErrorMessage(err, fallbackMessage);
}

module.exports = {
  getJoinFailureCode,
  normalizeJoinFailure,
  resolveJoinFailureMessage
};
