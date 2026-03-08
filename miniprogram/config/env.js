const DEFAULT_CLOUD_ENV_ID = 'cloud1-1ghmqjyt6428702b';

const ENV_CONFIG = {
  develop: {
    cloudEnvId: DEFAULT_CLOUD_ENV_ID,
    label: '开发环境',
    shortLabel: 'DEV'
  },
  trial: {
    cloudEnvId: DEFAULT_CLOUD_ENV_ID,
    label: '体验环境',
    shortLabel: 'TRIAL'
  },
  release: {
    cloudEnvId: DEFAULT_CLOUD_ENV_ID,
    label: '正式环境',
    shortLabel: 'PROD'
  }
};

function getRuntimeEnvVersion() {
  try {
    const info = typeof wx !== 'undefined' && wx.getAccountInfoSync ? wx.getAccountInfoSync() : null;
    const raw = String(info && info.miniProgram && info.miniProgram.envVersion || '').trim().toLowerCase();
    if (raw === 'develop' || raw === 'trial' || raw === 'release') return raw;
  } catch (_) {
    // ignore
  }
  return 'release';
}

function resolveRuntimeEnv(envVersion = getRuntimeEnvVersion()) {
  const key = ENV_CONFIG[envVersion] ? envVersion : 'release';
  const config = ENV_CONFIG[key];
  return {
    envVersion: key,
    cloudEnvId: config.cloudEnvId,
    label: config.label,
    shortLabel: config.shortLabel,
    showBadge: key !== 'release'
  };
}

module.exports = {
  DEFAULT_CLOUD_ENV_ID,
  ENV_CONFIG,
  getRuntimeEnvVersion,
  resolveRuntimeEnv
};
