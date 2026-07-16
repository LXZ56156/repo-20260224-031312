const cloud = require('wx-server-sdk');
const logic = require('./logic');
const common = require('./lib/common');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TRACE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function normalizeTraceId(value) {
  const traceId = typeof value === 'string' ? value.trim() : '';
  return TRACE_ID_RE.test(traceId) ? traceId : '';
}

function createHandler(options = {}) {
  const database = options.db || db;
  const env = options.env === undefined ? process.env : options.env;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const logger = options.logger || console;

  return async (event) => {
    const source = event && typeof event === 'object' ? event : {};
    const traceId = normalizeTraceId(source.__traceId);
    if (!logic.isServerEnabled(env)) {
      return common.okResult('EVENT_PIPELINE_DISABLED', '事件管道未启用', {
        state: 'disabled',
        traceId,
        data: {
          accepted: 0,
          deduped: 0,
          rejected: 0
        }
      });
    }

    try {
      const result = await logic.processBatch(database, source.events, now());
      if (!result.ok) {
        return common.failResult('PRODUCT_EVENTS_INVALID', '事件批次不合法', {
          state: 'invalid',
          traceId,
          data: {
            accepted: 0,
            deduped: 0,
            rejected: result.rejected,
            reason: result.code
          }
        });
      }
      return common.okResult('PRODUCT_EVENTS_ACCEPTED', '事件已接收', {
        state: 'accepted',
        traceId,
        data: {
          accepted: result.accepted,
          deduped: result.deduped,
          rejected: result.rejected,
          rejections: result.rejections
        }
      });
    } catch (_) {
      try {
        if (logger && typeof logger.error === 'function') {
          logger.error('[reportProductEvents]', traceId || '-', 'database failure');
        }
      } catch (_) {}
      return common.failResult('PRODUCT_EVENTS_DATABASE_FAILED', '事件暂未接收', {
        state: 'database_failure',
        traceId,
        data: {
          accepted: 0,
          deduped: 0,
          rejected: 0
        }
      });
    }
  };
}

exports.main = createHandler();
exports._private = {
  createHandler,
  normalizeTraceId
};
