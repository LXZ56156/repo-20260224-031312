const cloud = require('./cloud');

function showDeveloperHint(devHint) {
  if (!devHint || typeof devHint !== 'object') return;
  if (typeof wx === 'undefined' || typeof wx.showModal !== 'function') return;
  try {
    wx.showModal({
      title: devHint.title,
      content: devHint.content,
      showCancel: false
    });
  } catch (_) {
    // ignore
  }
}

function presentWriteError(options = {}) {
  const descriptor = cloud.describeWriteError(options);
  const ui = descriptor && descriptor.ui;
  if (!ui) return descriptor;

  if (ui.type === 'modal') {
    if (typeof wx !== 'undefined' && typeof wx.showModal === 'function') {
      wx.showModal({
        title: ui.title,
        content: ui.content,
        confirmText: ui.confirmText,
        cancelText: ui.cancelText,
        success: (res) => {
          if (res.confirm && typeof ui.onConfirm === 'function') ui.onConfirm();
          if (res.cancel && typeof ui.onCancel === 'function') ui.onCancel();
        }
      });
    }
    return descriptor;
  }

  if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
    wx.showToast({
      title: ui.title,
      icon: ui.icon || 'none'
    });
  }
  showDeveloperHint(descriptor && descriptor.devHint);
  return descriptor;
}

module.exports = {
  presentWriteError
};
