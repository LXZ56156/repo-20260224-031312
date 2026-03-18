function normalizeTitle(title) {
  const value = String(title || '').trim();
  return value || '加载中...';
}

async function withLoading(title, task) {
  const runner = typeof task === 'function' ? task : async () => undefined;
  wx.showLoading({ title: normalizeTitle(title) });
  try {
    return await runner();
  } finally {
    wx.hideLoading();
  }
}

module.exports = {
  withLoading
};
