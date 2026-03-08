function normalizeErrMsg(err) {
  if (!err) return '';
  return (err.errMsg || err.message || String(err));
}

function stripCloudPrefix(msg) {
  return String(msg || '').replace(/^cloud\.call:fail\s*/i, '').trim();
}

function parseCloudError(err, fallbackMessage = '操作失败') {
  const rawMessage = normalizeErrMsg(err);
  const cleaned = stripCloudPrefix(rawMessage);
  const low = cleaned.toLowerCase();
  const isConflict = (
    cleaned.includes('写入冲突') ||
    cleaned.includes('并发冲突') ||
    cleaned.includes('冲突') ||
    low.includes('version') ||
    low.includes('conflict')
  );
  const isNetwork = (
    low.includes('network') ||
    low.includes('timeout') ||
    low.includes('fail to connect') ||
    cleaned.includes('网络')
  );

  return {
    isConflict,
    isNetwork,
    rawMessage,
    userMessage: cleaned || fallbackMessage
  };
}

function classifyCloudError(parsed) {
  const p = parsed || {};
  if (p.isConflict) return 'conflict';
  if (p.isNetwork) return 'network';
  const low = String(p.userMessage || '').toLowerCase();
  if (
    low.includes('permission') ||
    low.includes('权限') ||
    low.includes('无权限') ||
    low.includes('仅管理员')
  ) return 'permission';
  if (
    low.includes('invalid') ||
    low.includes('不合法') ||
    low.includes('参数') ||
    low.includes('缺少')
  ) return 'param';
  return 'unknown';
}

function getUnifiedErrorMessage(err, fallbackMessage = '操作失败') {
  const parsed = parseCloudError(err, fallbackMessage);
  const level = classifyCloudError(parsed);
  if (level === 'network') return '网络异常，请重试';
  if (level === 'permission') return '权限不足';
  if (level === 'param') return '参数有误，请检查';
  return parsed.userMessage || fallbackMessage;
}

function presentWriteError(options = {}) {
  const err = options.err;
  const fallbackMessage = options.fallbackMessage || '操作失败';
  const parsed = parseCloudError(err, fallbackMessage);
  const level = classifyCloudError(parsed);

  if (parsed.isConflict) {
    wx.showModal({
      title: options.conflictTitle || '写入冲突',
      content: options.conflictContent || '数据已被他人更新，是否刷新后重试？',
      confirmText: options.confirmText || '刷新',
      cancelText: options.cancelText || '保留草稿',
      success: (res) => {
        if (res.confirm && typeof options.onRefresh === 'function') options.onRefresh();
        if (res.cancel && typeof options.onKeepDraft === 'function') options.onKeepDraft();
      }
    });
    return { ...parsed, level };
  }

  wx.showToast({
    title: getUnifiedErrorMessage(err, fallbackMessage),
    icon: 'none'
  });
  return { ...parsed, level };
}

function showDevHint(title, content) {
  // 仅在开发阶段提示更友好；线上同样不影响功能。
  try {
    wx.showModal({
      title,
      content,
      showCancel: false
    });
  } catch (e) {
    // ignore
  }
}

function call(name, data = {}) {
  return wx.cloud.callFunction({ name, data })
    .then(res => res.result)
    .catch(err => {
      const msg = normalizeErrMsg(err);
      console.error('云函数调用失败', name, err);

      // 常见“低级错误”做成可读提示
      if (msg.includes('FUNCTION_NOT_FOUND') || msg.includes('FunctionName parameter could not be found') || msg.includes('-501000')) {
        showDevHint(
          '云函数未部署',
          `云函数「${name}」在当前云环境中不存在。\n\n解决：微信开发者工具 → 云开发 → 选择正确环境 → 右键 cloudfunctions/${name} → “上传并部署：云端安装依赖”。`
        );
      } else if (msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('collection') && msg.includes('not exists') || msg.includes('-502005')) {
        showDevHint(
          '数据库集合不存在',
          '缺少 tournaments 集合。解决：云开发控制台 → 数据库 → 创建集合 tournaments（读权限允许，写入走云函数）。'
        );
      }

      throw err;
    });
}

module.exports = {
  call,
  parseCloudError,
  classifyCloudError,
  getUnifiedErrorMessage,
  presentWriteError
};
