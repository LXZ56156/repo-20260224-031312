const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');

function sanitizeText(v, max = 500) {
  return String(v || '').replace(/\r/g, '').trim().slice(0, max);
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
  const category = sanitizeText(event && event.category, 24) || '其他';
  const content = sanitizeText(event && event.content, 500);
  const contact = sanitizeText(event && event.contact, 64);
  if (content.length < 10) throw new Error('反馈内容至少10字');

  await ensureCollection('feedbacks');
  const col = db.collection('feedbacks');
  const now = Date.now();
  const nowDate = db.serverDate();

  if (clientRequestId) {
    const existing = await col.where({
      openid: OPENID,
      clientRequestId
    }).limit(1).get();
    const existingDoc = Array.isArray(existing && existing.data) ? existing.data[0] : null;
    if (existingDoc && existingDoc._id) {
      return common.okResult('FEEDBACK_SAVED', '反馈已提交', {
        traceId,
        state: 'deduped',
        deduped: true,
        ...(clientRequestId ? { clientRequestId } : {}),
        feedbackId: existingDoc._id
      });
    }
  }

  const recent = await col.where({
    openid: OPENID,
    createdAtMs: db.command.gte(now - 60 * 1000)
  }).limit(1).get();
  if (Array.isArray(recent.data) && recent.data.length) {
    throw new Error('提交太频繁，请稍后再试');
  }

  const addRes = await col.add({
    data: common.assertNoReservedRootKeys({
      openid: OPENID,
      category,
      content,
      contact,
      clientRequestId,
      createdAt: nowDate,
      createdAtMs: now
    }, ['_id'], '反馈提交数据')
  });
  return common.okResult('FEEDBACK_SAVED', '反馈已提交', {
    traceId,
    state: 'saved',
    ...(clientRequestId ? { clientRequestId } : {}),
    feedbackId: addRes._id
  });
};
