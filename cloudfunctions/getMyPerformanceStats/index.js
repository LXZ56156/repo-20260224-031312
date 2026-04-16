const cloud = require('wx-server-sdk');
const logic = require('./logic');
const common = require('./lib/common');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PAGE_SIZE = 100;
const QUERY_CAP = 4000;

async function listByWhere(where) {
  const col = db.collection('tournaments');
  const all = [];
  let skip = 0;
  let truncated = false;
  while (all.length < QUERY_CAP) {
    const remaining = QUERY_CAP - all.length;
    const pageSize = Math.min(PAGE_SIZE, remaining);
    const res = await col
      .where(where)
      .field({
        _id: true,
        status: true,
        players: true,
        playerIds: true,
        rounds: true,
        createdAt: true,
        updatedAt: true
      })
      .skip(skip)
      .limit(pageSize)
      .get();
    const data = Array.isArray(res && res.data) ? res.data : [];
    all.push(...data);
    if (data.length < pageSize) break;
    skip += data.length;
    if (all.length >= QUERY_CAP) {
      const probe = await col
        .where(where)
        .field({ _id: true })
        .skip(skip)
        .limit(1)
        .get();
      truncated = Array.isArray(probe && probe.data) && probe.data.length > 0;
      break;
    }
  }
  return { rows: all, truncated };
}

function dedupeById(list) {
  const map = {};
  for (const item of list || []) {
    const id = String(item && item._id || '').trim();
    if (!id) continue;
    map[id] = item;
  }
  return Object.values(map);
}

exports.main = async (event) => {
  // This endpoint is a fallback / analysis path only.
  // The "我的战绩" mainline stays on local completed snapshots to preserve product semantics.
  const { OPENID } = cloud.getWXContext();
  const window = logic.normalizeWindow(event && event.window);
  let fastRows = [];
  let legacyRows = [];
  let fallbackRows = [];
  let truncated = false;
  let needFullFallback = false;

  try {
    const fastResult = await listByWhere({
      status: 'finished',
      playerIds: _.in([OPENID])
    });
    fastRows = fastResult.rows;
    truncated = truncated || fastResult.truncated;
  } catch (_) {
    needFullFallback = true;
  }

  try {
    const legacyResult = await listByWhere({
      status: 'finished',
      playerIds: _.exists(false)
    });
    legacyRows = legacyResult.rows;
    truncated = truncated || legacyResult.truncated;
  } catch (_) {
    // exists 查询在极个别环境可能不可用，回退到全量 finished 扫描
    needFullFallback = true;
  }

  if (needFullFallback) {
    const fallbackResult = await listByWhere({ status: 'finished' });
    fallbackRows = fallbackResult.rows;
    truncated = truncated || fallbackResult.truncated;
  }

  const source = dedupeById(fastRows.concat(legacyRows, fallbackRows));
  const result = logic.computeMyPerformanceStats(source, OPENID, window, Date.now());
  return common.okResult('PERFORMANCE_STATS_READY', '已获取战绩统计', {
    state: 'updated',
    truncated,
    queryCap: QUERY_CAP,
    ...result,
    updatedAt: new Date().toISOString()
  });
};
