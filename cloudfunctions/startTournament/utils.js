/**
 * startTournament 公共工具函数
 * 提取自 rotation.js / rotationDoublesEngine.js / scheduleModes.js / squadDoublesEngine.js
 * 避免跨文件重复定义
 */

/**
 * 生成规范化的双人配对 key，保证 pairKey(a,b) === pairKey(b,a)
 */
function pairKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/**
 * 稳定排序 ID 列表：过滤空值、去除首尾空格、按字典序升序
 */
function stableSortIds(ids) {
  return (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

module.exports = { pairKey, stableSortIds };
