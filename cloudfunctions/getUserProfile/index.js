const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  let doc = null;
  try {
    const res = await db.collection('user_profiles').where({ openid: OPENID }).limit(1).get();
    doc = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  } catch (err) {
    if (common.isCollectionNotExists(err)) {
      return common.okResult('PROFILE_READY', '已读取资料', {
        traceId,
        state: 'ready',
        profile: null
      });
    }
    return common.failResult('PROFILE_LOAD_FAILED', '读取资料失败，请稍后重试', {
      traceId
    });
  }
  if (!doc) {
    return common.okResult('PROFILE_READY', '已读取资料', {
      traceId,
      state: 'ready',
      profile: null
    });
  }
  return common.okResult('PROFILE_READY', '已读取资料', {
    traceId,
    state: 'ready',
    profile: {
      nickName: String(doc.nickname || '').trim(),
      avatar: String(doc.avatar || '').trim(),
      gender: String(doc.gender || 'unknown').trim().toLowerCase()
    }
  });
};
