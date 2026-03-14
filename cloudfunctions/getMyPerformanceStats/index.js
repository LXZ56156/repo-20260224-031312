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
  while (skip <= QUERY_CAP) {
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
      .limit(PAGE_SIZE)
      .get();
    const data = Array.isArray(res && res.data) ? res.data : [];
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    skip += data.length;
  }
  return all;
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
  let needFullFallback = false;

  try {
    fastRows = await listByWhere({
      status: 'finished',
      playerIds: _.in([OPENID])
    });
  } catch (_) {
    needFullFallback = true;
  }

  try {
    legacyRows = await listByWhere({
      status: 'finished',
      playerIds: _.exists(false)
    });
  } catch (_) {
    // exists 查询在极个别环境可能不可用，回退到全量 finished 扫描
    needFullFallback = true;
  }

  if (needFullFallback) {
    fallbackRows = await listByWhere({ status: 'finished' });
  }

  const source = dedupeById(fastRows.concat(legacyRows, fallbackRows));
  const result = logic.computeMyPerformanceStats(source, OPENID, window, Date.now());
  return common.okResult('PERFORMANCE_STATS_READY', '已获取战绩统计', {
    state: 'updated',
    ...result,
    updatedAt: new Date().toISOString()
  });
};
