const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const common = require('./lib/common');
const player = require('./lib/player');
const { isValidFinishedScore } = require('./lib/score');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const PAGE_SIZE = 20;
const SCAN_LIMIT = 100;
const FIELDS = { _id: true, name: true, mode: true, status: true, creatorId: true, players: true, playerIds: true, rounds: true, updatedAt: true };

function participant(doc, openid) {
  // The actual roster takes precedence over a stale denormalized index.
  if (Array.isArray(doc.players)) return doc.players.some((item) => player.extractPlayerId(item) === openid);
  return Array.isArray(doc.playerIds) && doc.playerIds.includes(openid);
}
function position(doc) {
  if (!(doc.updatedAt instanceof Date) || !Number.isFinite(+doc.updatedAt) || !String(doc._id || '')) {
    throw new Error('Unsupported tournament ordering data');
  }
  return { time: +doc.updatedAt, id: String(doc._id) };
}
function compare(a, b) {
  const left = position(a);
  const right = position(b);
  return right.time - left.time || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}
function signature(payload, openid) {
  return crypto.createHmac('sha256', openid).update(payload).digest('hex');
}
function encodeCursor(routes, openid) {
  const payload = Buffer.from(JSON.stringify({ v: 1, routes: routes.map((route) => ({ last: route.last, done: route.done && route.index >= route.rows.length })) })).toString('base64url');
  return `${payload}.${signature(payload, openid)}`;
}
function decodeCursor(cursor, openid) {
  if (!cursor) return [{ last: null, done: false }, { last: null, done: false }];
  if (typeof cursor !== 'string' || cursor.length > 4096 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(cursor)) throw new Error('Invalid cursor');
  const [payload, sig] = cursor.split('.');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(signature(payload, openid)))) throw new Error('Invalid cursor');
  const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (value.v !== 1 || !Array.isArray(value.routes) || value.routes.length !== 2) throw new Error('Invalid cursor');
  value.routes.forEach((route) => {
    if (!route || typeof route.done !== 'boolean') throw new Error('Invalid cursor');
    if (route.last !== null && (!route.last || !Number.isFinite(route.last.time) || typeof route.last.id !== 'string' || !route.last.id || route.last.id.length > 256)) throw new Error('Invalid cursor');
  });
  return value.routes;
}
function baseQuery(route, openid) {
  const status = { status: _.in(['draft', 'running', 'finished']) };
  if (route === 0) return _.and([status, { creatorId: openid }]);
  // Owner records belong to the first stream; this prevents overlap across pages.
  return _.and([status, { creatorId: _.neq(openid) }, _.or([
    { playerIds: _.in([openid]) }, { players: _.in([openid]) },
    { 'players.id': openid }, { 'players.playerId': openid }, { 'players._id': openid }
  ])]);
}
async function head(route, openid) {
  while (route.scanned < SCAN_LIMIT) {
    if (route.index >= route.rows.length) {
      if (route.done) return null;
      const clauses = [baseQuery(route.number, openid)];
      if (route.last) clauses.push(_.or([
        { updatedAt: _.lt(new Date(route.last.time)) },
        _.and([{ updatedAt: _.eq(new Date(route.last.time)) }, { _id: _.gt(route.last.id) }])
      ]));
      const response = await db.collection('tournaments').where(_.and(clauses))
        .orderBy('updatedAt', 'desc').orderBy('_id', 'asc').field(FIELDS).limit(PAGE_SIZE + 1).get();
      if (!response || !Array.isArray(response.data)) throw new Error('Invalid database response');
      route.rows = response.data;
      route.index = 0;
      route.done = route.rows.length < PAGE_SIZE + 1;
      if (!route.rows.length) return null;
    }
    const doc = route.rows[route.index];
    position(doc);
    if (route.number === 0 ? String(doc.creatorId || '') === openid : participant(doc, openid) && String(doc.creatorId || '') !== openid) return doc;
    consume(route, doc);
  }
  route.capped = true;
  return null;
}
function consume(route, doc) {
  route.last = position(doc);
  route.index += 1;
  route.scanned += 1;
}
function summary(doc, openid) {
  const matches = (Array.isArray(doc.rounds) ? doc.rounds : []).flatMap((round) => Array.isArray(round && round.matches) ? round.matches : []);
  const roles = [];
  if (String(doc.creatorId || '') === openid) roles.push('owner');
  if (participant(doc, openid)) roles.push('participant');
  return {
    id: String(doc._id), name: String(doc.name || '未命名比赛'), mode: String(doc.mode || ''),
    status: String(doc.status), updatedAt: new Date(position(doc).time).toISOString(), roles,
    completedMatches: matches.filter((match) => match && match.status === 'finished' && isValidFinishedScore(match)).length, totalMatches: matches.length
  };
}

exports.main = async (event = {}) => {
  const openid = String(cloud.getWXContext().OPENID || '').trim();
  if (!openid) return common.failResult('PERMISSION_DENIED', '请先登录后找回比赛', { state: 'forbidden' });
  let states;
  try { states = decodeCursor(event && event.cursor, openid); }
  catch (_) { return common.failResult('INVALID_CURSOR', '列表已失效，请刷新后重试', { state: 'invalid' }); }
  const routes = states.map((state, number) => ({ ...state, number, rows: [], index: 0, scanned: 0, capped: false }));
  try {
    const items = [];
    const seen = new Set();
    let heads = await Promise.all(routes.map((route) => head(route, openid)));
    while (items.length < PAGE_SIZE && heads.some(Boolean) && !routes.some((route) => route.capped)) {
      const number = !heads[0] ? 1 : !heads[1] ? 0 : compare(heads[0], heads[1]) <= 0 ? 0 : 1;
      const doc = heads[number];
      consume(routes[number], doc);
      if (!seen.has(doc._id)) { seen.add(doc._id); items.push(summary(doc, openid)); }
      heads[number] = await head(routes[number], openid);
    }
    const completePage = !routes.some((route) => route.capped);
    const hasMore = heads.some(Boolean) || !completePage;
    return common.okResult(completePage ? 'TOURNAMENTS_FOUND' : 'TOURNAMENT_RECOVERY_PAGE_PARTIAL', '已获取比赛列表', {
      state: 'updated', items, hasMore, completePage, pageSize: PAGE_SIZE,
      nextCursor: hasMore ? encodeCursor(routes, openid) : ''
    });
  } catch (err) {
    console.error('getMyTournaments query failed', err);
    return common.failResult('TOURNAMENT_RECOVERY_FAILED', '比赛加载失败，请重试', { state: 'error' });
  }
};
