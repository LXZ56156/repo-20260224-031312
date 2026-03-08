const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  let doc = null;
  try {
    const res = await db.collection('user_profiles').where({ openid: OPENID }).limit(1).get();
    doc = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
  } catch (_) {
    return { profile: null };
  }
  if (!doc) return { profile: null };
  return {
    profile: {
      nickName: String(doc.nickname || '').trim(),
      avatar: String(doc.avatar || '').trim(),
      gender: String(doc.gender || 'unknown').trim().toLowerCase()
    }
  };
};
