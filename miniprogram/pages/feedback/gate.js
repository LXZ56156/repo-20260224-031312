function resolveFeedbackGate(gate) {
  const g = gate && typeof gate === 'object' ? gate : {};
  if (g.ok === true) {
    return {
      blocked: false,
      blockNeedProfile: false,
      blockTitle: '',
      blockMessage: ''
    };
  }
  const reason = String(g.reason || '').trim();
  if (reason === 'need_profile') {
    return {
      blocked: true,
      blockNeedProfile: true,
      blockTitle: '请先完善资料',
      blockMessage: '完善资料后才可提交反馈。'
    };
  }
  if (reason === 'login_failed') {
    return {
      blocked: true,
      blockNeedProfile: false,
      blockTitle: '登录失败',
      blockMessage: '请检查网络后重试。'
    };
  }
  return {
    blocked: true,
    blockNeedProfile: false,
    blockTitle: '暂不可用',
    blockMessage: '请稍后重试。'
  };
}

module.exports = {
  resolveFeedbackGate
};
