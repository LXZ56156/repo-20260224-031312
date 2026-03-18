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
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
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
  if (doc && clientRequestId && String(doc.lastClientRequestId || '').trim() === clientRequestId) {
    return common.okResult('PROFILE_SAVED', '已保存资料', {
      traceId,
      state: 'deduped',
      deduped: true,
      ...(clientRequestId ? { clientRequestId } : {}),
      profileId: doc._id
    });
  }
  if (!doc) {
    const addData = {
      openid: OPENID,
      nickname,
      avatar,
      gender,
      createdAt: now,
      updatedAt: now
    };
    if (clientRequestId) addData.lastClientRequestId = clientRequestId;
    const addRes = await col.add({
      data: common.assertNoReservedRootKeys(addData, ['_id'], '用户资料新增数据')
    });
    return common.okResult('PROFILE_SAVED', '已保存资料', {
      traceId,
      state: 'updated',
      ...(clientRequestId ? { clientRequestId } : {}),
      profileId: addRes._id
    });
  }
  const updateData = {
    nickname,
    avatar,
    gender,
    updatedAt: now
  };
  if (clientRequestId) updateData.lastClientRequestId = clientRequestId;
  await col.doc(doc._id).update({
    data: common.assertNoReservedRootKeys(updateData, ['_id'], '用户资料更新数据')
  });
  return common.okResult('PROFILE_SAVED', '已保存资料', {
    traceId,
    state: 'updated',
    ...(clientRequestId ? { clientRequestId } : {}),
    profileId: doc._id
  });
};
