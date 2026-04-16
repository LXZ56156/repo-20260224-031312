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
  if (clientRequestId) {
    await common.ensureCollection(db, common.CLIENT_REQUEST_LOG_COLLECTION);
  }
  const now = Date.now();
  const nowDate = db.serverDate();
  const requestLogOptions = {
    scope: 'feedback_submit',
    subjectKey: `feedback:${OPENID}`,
    operatorOpenId: OPENID,
    clientRequestId
  };

  try {
    return await common.runTransactionCompat(db, async (transaction) => {
      if (clientRequestId) {
        const requestLog = await common.getClientRequestLog(transaction, requestLogOptions);
        if (common.isSuccessfulClientRequestLog(requestLog) && String(requestLog.resourceId || '').trim()) {
          return common.okResult('FEEDBACK_SAVED', '反馈已提交', {
            traceId,
            state: 'deduped',
            deduped: true,
            ...(clientRequestId ? { clientRequestId } : {}),
            feedbackId: String(requestLog.resourceId || '').trim()
          });
        }
      }

      const col = transaction.collection('feedbacks');
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
      const feedbackId = String(addRes && addRes._id || '').trim();
      if (clientRequestId) {
        await common.upsertClientRequestLog(transaction, db, {
          ...requestLogOptions,
          status: 'succeeded',
          resourceType: 'feedback',
          resourceId: feedbackId,
          responseCode: 'FEEDBACK_SAVED',
          responseState: 'saved'
        });
      }
      return common.okResult('FEEDBACK_SAVED', '反馈已提交', {
        traceId,
        state: 'saved',
        ...(clientRequestId ? { clientRequestId } : {}),
        feedbackId
      });
    });
  } catch (err) {
    if (clientRequestId) {
      const requestLog = await common.getClientRequestLog(db, requestLogOptions);
      if (common.isSuccessfulClientRequestLog(requestLog) && String(requestLog.resourceId || '').trim()) {
        return common.okResult('FEEDBACK_SAVED', '反馈已提交', {
          traceId,
          state: 'deduped',
          deduped: true,
          ...(clientRequestId ? { clientRequestId } : {}),
          feedbackId: String(requestLog.resourceId || '').trim()
        });
      }
    }
    throw err;
  }
};
