// 获取微信用户昵称/头像（兼容不同基础库：回调/Promise）
// 注意：微信可能返回“微信用户”占位昵称；此时视为未获取到真实昵称。

function wrapGetUserProfile(desc) {
  return new Promise((resolve, reject) => {
    if (!wx || typeof wx.getUserProfile !== 'function') {
      reject(new Error('API_NOT_SUPPORTED'));
      return;
    }

    // 部分基础库不支持 Promise 形态，统一用回调封装
    wx.getUserProfile({
      desc: desc || '用于展示昵称与头像',
      success: (res) => resolve(res),
      fail: (err) => reject(err)
    });
  });
}

function extractWechatProfile(res) {
  const userInfo = res && (res.userInfo || res);
  const rawNick = String(
    (userInfo && (userInfo.nickName || userInfo.nickname || userInfo.name || userInfo.nick)) || ''
  ).trim();
  const rawAvatar = String(
    (userInfo && (userInfo.avatarUrl || userInfo.avatar || userInfo.avatarURL)) || ''
  ).trim();

  const nickName = (rawNick === '微信用户' ? '' : rawNick).slice(0, 24);
  const avatarUrl = rawAvatar;

  return { nickName, avatarUrl, rawNick, rawAvatar };
}

async function getWechatProfile(desc) {
  const res = await wrapGetUserProfile(desc);
  return extractWechatProfile(res);
}

module.exports = {
  getWechatProfile,
  extractWechatProfile
};
