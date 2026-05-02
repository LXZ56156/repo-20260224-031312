function warnStorageFailure(action, key, err) {
  try {
    console.warn(`storage ${action} failed`, String(key || ''), err);
  } catch (_) {
    // ignore
  }
}

const get = (key, fallback = null) => {
  try {
    const value = wx.getStorageSync(key);
    return value === undefined ? fallback : value;
  } catch (err) {
    warnStorageFailure('read', key, err);
    return fallback;
  }
};

const set = (key, value) => {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (err) {
    warnStorageFailure('set', key, err);
    return false;
  }
};

const del = (key) => {
  try {
    wx.removeStorageSync(key);
    return true;
  } catch (err) {
    warnStorageFailure('remove', key, err);
    return false;
  }
};

module.exports = {
  get,
  set,
  del
};
