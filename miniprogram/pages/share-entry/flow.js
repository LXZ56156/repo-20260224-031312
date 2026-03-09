function parseTournamentId(options = {}) {
  let tid = String(options.tournamentId || '').trim();
  if (!tid && options.scene) {
    const scene = decodeURIComponent(options.scene);
    const matched = /tournamentId=([^&]+)/.exec(scene) || /tid=([^&]+)/.exec(scene);
    if (matched) tid = matched[1];
  }
  return tid;
}

function buildReturnUrl(tournamentId, intent = 'join') {
  return `/pages/share-entry/index?tournamentId=${encodeURIComponent(String(tournamentId || '').trim())}&intent=${encodeURIComponent(String(intent || 'join').trim() || 'join')}`;
}

function buildLobbyUrl(tournamentId, intent = 'join') {
  return `/pages/lobby/index?tournamentId=${encodeURIComponent(String(tournamentId || '').trim())}&intent=${encodeURIComponent(String(intent || 'join').trim() || 'join')}&fromShare=1`;
}

function resolveShareEntryFlow({ tournamentId, intent = 'join', gate }) {
  const tid = String(tournamentId || '').trim();
  const nextIntent = String(intent || 'join').trim() || 'join';
  if (!tid) {
    return {
      action: 'invalid',
      state: {
        title: '链接无效',
        message: '未识别到赛事信息，请重新打开分享链接。',
        showRetry: true
      }
    };
  }

  const currentGate = gate && typeof gate === 'object' ? gate : {};
  if (!currentGate.ok) {
    if (currentGate.reason === 'login_failed') {
      return {
        action: 'login_failed',
        state: {
          title: '登录失败',
          message: '请检查网络后重试。',
          showRetry: true
        }
      };
    }
    if (currentGate.reason === 'need_profile') {
      return {
        action: 'need_profile',
        state: {
          title: '正在校验资料',
          message: '首次进入需完善昵称和性别。',
          showRetry: false
        }
      };
    }
  }

  return {
    action: 'redirect',
    state: {
      title: '正在进入比赛',
      message: '即将打开赛事页面...',
      showRetry: false
    },
    lobbyUrl: buildLobbyUrl(tid, nextIntent),
    returnUrl: buildReturnUrl(tid, nextIntent)
  };
}

module.exports = {
  parseTournamentId,
  buildReturnUrl,
  buildLobbyUrl,
  resolveShareEntryFlow
};
