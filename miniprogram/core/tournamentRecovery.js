const cloud = require('./cloud');

const STATUS_LABELS = { draft: '未开赛', running: '进行中', finished: '已结束' };
const MODE_LABELS = { multi_rotate: '多人轮转', squad_doubles: '小队双打', fixed_pair_rr: '固定搭档' };

function toListItem(item) {
  const source = item && typeof item === 'object' ? item : {};
  const roles = Array.isArray(source.roles) ? source.roles : [];
  return {
    id: String(source.id || ''), name: String(source.name || '未命名比赛'),
    statusText: STATUS_LABELS[source.status] || '比赛', modeText: MODE_LABELS[source.mode] || '比赛',
    roleText: roles.includes('owner') ? (roles.includes('participant') ? '主办 · 参赛' : '主办') : '参赛',
    progressText: `${Math.max(0, Number(source.completedMatches) || 0)} / ${Math.max(0, Number(source.totalMatches) || 0)} 场已完成`
  };
}

async function getPage(cursor = '') {
  const result = cloud.assertWriteResult(await cloud.call('getMyTournaments', { cursor }), '比赛加载失败，请重试');
  const data = result.data;
  if (!Array.isArray(data.items) || typeof data.hasMore !== 'boolean' || (data.hasMore && !String(data.nextCursor || ''))) {
    throw new Error('比赛加载失败，请重试');
  }
  return { items: data.items.map(toListItem).filter((item) => item.id), hasMore: data.hasMore, cursor: data.hasMore ? String(data.nextCursor) : '' };
}

module.exports = { getPage };
