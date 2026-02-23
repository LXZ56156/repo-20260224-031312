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

module.exports = { call, parseCloudError };
