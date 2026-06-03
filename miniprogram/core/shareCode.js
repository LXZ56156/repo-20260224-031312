const cloud = require('./cloud');

let shareCodeCache = {};
let shareCodePromises = {};

function normalizeEnvVersion(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'develop' || normalized === 'trial') return normalized;
  return 'release';
}

function resolveEnvVersion(options = {}) {
  if (options.envVersion) return normalizeEnvVersion(options.envVersion);
  const runtimeEnv = cloud.getRuntimeEnv();
  return normalizeEnvVersion(runtimeEnv && runtimeEnv.envVersion);
}

function buildCacheKey(tournamentId, envVersion) {
  return `${String(tournamentId || '').trim()}:${normalizeEnvVersion(envVersion)}`;
}

function extractFileID(result) {
  return String(
    (result && result.fileID) ||
    (result && result.data && result.data.fileID) ||
    ''
  ).trim();
}

function getTournamentShareCode(tournamentId, options = {}) {
  const tid = String(tournamentId || '').trim();
  if (!tid) return Promise.resolve('');

  const envVersion = resolveEnvVersion(options);
  const cacheKey = buildCacheKey(tid, envVersion);
  if (shareCodeCache[cacheKey]) return Promise.resolve(shareCodeCache[cacheKey]);
  if (shareCodePromises[cacheKey]) return shareCodePromises[cacheKey];

  shareCodePromises[cacheKey] = cloud.call('generateShareCode', {
    tournamentId: tid,
    envVersion
  }).then((result) => {
    const normalized = cloud.assertWriteResult(result, '小程序码生成失败');
    const fileID = extractFileID(normalized);
    if (!fileID) throw new Error('小程序码生成结果缺少 fileID');
    shareCodeCache[cacheKey] = fileID;
    return fileID;
  }).finally(() => {
    delete shareCodePromises[cacheKey];
  });

  return shareCodePromises[cacheKey];
}

module.exports = {
  getTournamentShareCode,
  _private: {
    normalizeEnvVersion,
    resolveEnvVersion,
    buildCacheKey,
    extractFileID,
    clearCache() {
      shareCodeCache = {};
      shareCodePromises = {};
    }
  }
};
