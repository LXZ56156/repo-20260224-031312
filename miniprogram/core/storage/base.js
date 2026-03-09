const get = (key, fallback = null) => {
  try {
    const value = wx.getStorageSync(key);
    return value === undefined ? fallback : value;
  } catch (_) {
    return fallback;
  }
};

const set = (key, value) => {
  try {
    wx.setStorageSync(key, value);
  } catch (_) {
    // ignore
  }
};

const del = (key) => {
  try {
    wx.removeStorageSync(key);
  } catch (_) {
    // ignore
  }
};

module.exports = {
  get,
  set,
  del
};
