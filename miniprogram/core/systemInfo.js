const DEFAULT_WINDOW_WIDTH = 375;
const DEFAULT_WINDOW_HEIGHT = 667;
const DEFAULT_PIXEL_RATIO = 1;

function toNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function cloneSafeArea(safeArea, windowWidth, windowHeight) {
  if (!safeArea || typeof safeArea !== 'object') {
    return {
      left: 0,
      right: windowWidth,
      top: 0,
      bottom: windowHeight,
      width: windowWidth,
      height: windowHeight
    };
  }
  const width = toNumber(safeArea.width, windowWidth);
  const height = toNumber(safeArea.height, windowHeight);
  const left = toNumber(safeArea.left, 0);
  const top = toNumber(safeArea.top, 0);
  return {
    left,
    right: toNumber(safeArea.right, left + width),
    top,
    bottom: toNumber(safeArea.bottom, top + height),
    width,
    height
  };
}

function getWindowMetrics() {
  let raw = {};
  if (typeof wx !== 'undefined' && wx && typeof wx.getWindowInfo === 'function') {
    try {
      raw = wx.getWindowInfo() || {};
    } catch (err) {
      raw = {};
    }
  }
  // Compatibility fallback stays on static defaults only. Do not reintroduce wx.getSystemInfo/getSystemInfoSync here.

  const windowWidth = toNumber(raw.windowWidth, DEFAULT_WINDOW_WIDTH);
  const windowHeight = toNumber(raw.windowHeight, DEFAULT_WINDOW_HEIGHT);
  const screenWidth = toNumber(raw.screenWidth, windowWidth);
  const screenHeight = toNumber(raw.screenHeight, windowHeight);

  return {
    windowWidth,
    windowHeight,
    statusBarHeight: toNumber(raw.statusBarHeight, 0),
    pixelRatio: toNumber(raw.pixelRatio, DEFAULT_PIXEL_RATIO),
    screenWidth,
    screenHeight,
    safeArea: cloneSafeArea(raw.safeArea, windowWidth, windowHeight),
    screenTop: toNumber(raw.screenTop, 0)
  };
}

function getDeviceBaseInfo() {
  let raw = {};
  if (typeof wx !== 'undefined' && wx && typeof wx.getDeviceInfo === 'function') {
    try {
      raw = wx.getDeviceInfo() || {};
    } catch (err) {
      raw = {};
    }
  }
  return {
    brand: typeof raw.brand === 'string' ? raw.brand : '',
    model: typeof raw.model === 'string' ? raw.model : '',
    system: typeof raw.system === 'string' ? raw.system : '',
    platform: typeof raw.platform === 'string' ? raw.platform : '',
    benchmarkLevel: Number.isFinite(raw.benchmarkLevel) ? raw.benchmarkLevel : -1
  };
}

function getAppBaseInfoSafe() {
  let raw = {};
  if (typeof wx !== 'undefined' && wx && typeof wx.getAppBaseInfo === 'function') {
    try {
      raw = wx.getAppBaseInfo() || {};
    } catch (err) {
      raw = {};
    }
  }
  return {
    SDKVersion: typeof raw.SDKVersion === 'string' ? raw.SDKVersion : '',
    enableDebug: raw.enableDebug === true,
    host: raw.host && typeof raw.host === 'object' ? { ...raw.host } : {},
    language: typeof raw.language === 'string' ? raw.language : '',
    version: typeof raw.version === 'string' ? raw.version : '',
    theme: typeof raw.theme === 'string' ? raw.theme : undefined,
    fontSizeScaleFactor: Number.isFinite(raw.fontSizeScaleFactor) ? raw.fontSizeScaleFactor : 1
  };
}

module.exports = {
  getWindowMetrics,
  getDeviceBaseInfo,
  getAppBaseInfoSafe
};
