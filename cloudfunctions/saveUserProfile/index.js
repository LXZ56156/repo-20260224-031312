const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

async function ensureCollection(name) {
  try {
    if (typeof db.createCollection === 'function') {
      await db.createCollection(name);
    }
  } catch (_) {
    // ignore
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const nickname = String(event && event.nickname || '').trim();
  const avatar = String(event && event.avatar || '').trim();
  const gender = normalizeGender(event && event.gender);
  if (!nickname) throw new Error('昵称不能为空');
  if (gender === 'unknown') throw new Error('性别不能为空');

  await ensureCollection('user_profiles');
  const col = db.collection('user_profiles');
  const now = db.serverDate();
  const findRes = await col.where({ openid: OPENID }).limit(1).get();
  const doc = Array.isArray(findRes.data) && findRes.data[0] ? findRes.data[0] : null;
  if (!doc) {
    const addRes = await col.add({
      data: common.assertNoReservedRootKeys({
        openid: OPENID,
        nickname,
        avatar,
        gender,
        createdAt: now,
        updatedAt: now
      }, ['_id'], '用户资料新增数据')
    });
    return { ok: true, profileId: addRes._id };
  }
  await col.doc(doc._id).update({
    data: common.assertNoReservedRootKeys({
      nickname,
      avatar,
      gender,
      updatedAt: now
    }, ['_id'], '用户资料更新数据')
  });
  return { ok: true, profileId: doc._id };
};
