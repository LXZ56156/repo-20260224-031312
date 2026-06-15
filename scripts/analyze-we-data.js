#!/usr/bin/env node
/**
 * we 分析数据综合分析脚本
 * 读取 data/we-analysis/ 下所有 CSV/JSON，生成全面分析报告
 */
const fsp = require('node:fs/promises');
const path = require('node:path');

const DATA_DIR = path.resolve(__dirname, '..', 'data', 'we-analysis');

async function readCsv(filePath) {
  const text = await fsp.readFile(filePath, 'utf8');
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = [];
    let inQuote = false, cell = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { cells.push(cell); cell = ''; continue; }
      cell += ch;
    }
    cells.push(cell);
    const row = {};
    headers.forEach((h, i) => row[h] = cells[i] || '');
    return row;
  });
}

async function readAllCsvByType(type) {
  let files;
  try { files = await fsp.readdir(DATA_DIR); } catch { return []; }
  const csvFiles = files.filter(f => f.startsWith(`${type}-`) && f.endsWith('.csv')).sort();
  const allRows = [];
  for (const file of csvFiles) {
    const rows = await readCsv(path.join(DATA_DIR, file));
    for (const row of rows) {
      row._file = file;
      allRows.push(row);
    }
  }
  return allRows;
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function pct(v) { return (v * 100).toFixed(1) + '%'; }

// ============ 1. 访问趋势分析 ============
async function analyzeVisitTrend() {
  const rows = await readAllCsvByType('dailyVisitTrend');
  if (!rows.length) return null;

  rows.sort((a, b) => (a.ref_date || '').localeCompare(b.ref_date || ''));

  const daily = rows.map(r => ({
    date: r.ref_date,
    session_cnt: num(r.session_cnt),
    visit_pv: num(r.visit_pv),
    visit_uv: num(r.visit_uv),
    visit_uv_new: num(r.visit_uv_new),
    stay_time_uv: num(r.stay_time_uv),
    stay_time_session: num(r.stay_time_session),
    visit_depth: num(r.visit_depth)
  }));

  // Split into periods for comparison
  const half = Math.floor(daily.length / 2);
  const firstHalf = daily.slice(0, half);
  const secondHalf = daily.slice(half);

  const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const sum = arr => arr.reduce((s, v) => s + v, 0);

  const firstAvg = {
    uv: avg(firstHalf.map(d => d.visit_uv)),
    uv_new: avg(firstHalf.map(d => d.visit_uv_new)),
    pv: avg(firstHalf.map(d => d.visit_pv)),
    session: avg(firstHalf.map(d => d.session_cnt)),
    stay_uv: avg(firstHalf.map(d => d.stay_time_uv)),
    stay_session: avg(firstHalf.map(d => d.stay_time_session)),
    depth: avg(firstHalf.map(d => d.visit_depth))
  };

  const secondAvg = {
    uv: avg(secondHalf.map(d => d.visit_uv)),
    uv_new: avg(secondHalf.map(d => d.visit_uv_new)),
    pv: avg(secondHalf.map(d => d.visit_pv)),
    session: avg(secondHalf.map(d => d.session_cnt)),
    stay_uv: avg(secondHalf.map(d => d.stay_time_uv)),
    stay_session: avg(secondHalf.map(d => d.stay_time_session)),
    depth: avg(secondHalf.map(d => d.visit_depth))
  };

  // Last 7, 30 days
  const last7 = daily.slice(-7);
  const last30 = daily.slice(-30);

  // New user ratio trend
  const newUserRatios = daily.map(d => ({
    date: d.date,
    ratio: d.visit_uv > 0 ? d.visit_uv_new / d.visit_uv : 0,
    uv: d.visit_uv,
    uv_new: d.visit_uv_new
  }));

  return {
    totalDays: daily.length,
    dateRange: `${daily[0].date} - ${daily[daily.length - 1].date}`,
    firstHalfAvg: firstAvg,
    secondHalfAvg: secondAvg,
    changes: {
      uv: pct((secondAvg.uv - firstAvg.uv) / (firstAvg.uv || 1)),
      uv_new: pct((secondAvg.uv_new - firstAvg.uv_new) / (firstAvg.uv_new || 1)),
      pv: pct((secondAvg.pv - firstAvg.pv) / (firstAvg.pv || 1)),
      session: pct((secondAvg.session - firstAvg.session) / (firstAvg.session || 1)),
      stay_uv: pct((secondAvg.stay_uv - firstAvg.stay_uv) / (firstAvg.stay_uv || 1)),
      depth: pct((secondAvg.depth - firstAvg.depth) / (firstAvg.depth || 1))
    },
    last7Avg: {
      uv: avg(last7.map(d => d.visit_uv)),
      uv_new: avg(last7.map(d => d.visit_uv_new)),
      pv: avg(last7.map(d => d.visit_pv)),
      session: avg(last7.map(d => d.session_cnt)),
      stay_uv: avg(last7.map(d => d.stay_time_uv)),
      stay_session: avg(last7.map(d => d.stay_time_session)),
      depth: avg(last7.map(d => d.visit_depth)),
      newUserRatio: avg(last7.map(d => d.visit_uv > 0 ? d.visit_uv_new / d.visit_uv : 0))
    },
    last30Avg: {
      uv: avg(last30.map(d => d.visit_uv)),
      uv_new: avg(last30.map(d => d.visit_uv_new)),
      pv: avg(last30.map(d => d.visit_pv)),
      session: avg(last30.map(d => d.session_cnt)),
      stay_uv: avg(last30.map(d => d.stay_time_uv)),
      depth: avg(last30.map(d => d.visit_depth)),
      newUserRatio: avg(last30.map(d => d.visit_uv > 0 ? d.visit_uv_new / d.visit_uv : 0))
    },
    allTimeAvg: {
      uv: avg(daily.map(d => d.visit_uv)),
      uv_new: avg(daily.map(d => d.visit_uv_new)),
      pv: avg(daily.map(d => d.visit_pv)),
      session: avg(daily.map(d => d.session_cnt)),
      stay_uv: avg(daily.map(d => d.stay_time_uv)),
      stay_session: avg(daily.map(d => d.stay_time_session)),
      depth: avg(daily.map(d => d.visit_depth)),
      newUserRatio: avg(daily.map(d => d.visit_uv > 0 ? d.visit_uv_new / d.visit_uv : 0))
    },
    daily,
    newUserRatios,
    // Weekday vs weekend analysis
    weekendDays: daily.filter(d => {
      const dt = new Date(d.date.slice(0,4), d.date.slice(4,6)-1, d.date.slice(6,8));
      return dt.getDay() === 0 || dt.getDay() === 6;
    }),
    weekdayDays: daily.filter(d => {
      const dt = new Date(d.date.slice(0,4), d.date.slice(4,6)-1, d.date.slice(6,8));
      return dt.getDay() !== 0 && dt.getDay() !== 6;
    })
  };
}

async function readJsonFilesByType(type) {
  let files;
  try { files = await fsp.readdir(DATA_DIR); } catch { return []; }
  const jsonFiles = files.filter(f => f.startsWith(`${type}-`) && f.endsWith('.json')).sort();
  const results = [];
  for (const file of jsonFiles) {
    try {
      const data = JSON.parse(await fsp.readFile(path.join(DATA_DIR, file), 'utf8'));
      results.push(data);
    } catch { /* skip corrupt files */ }
  }
  return results;
}

// ============ 2. 留存分析 ============
async function analyzeRetention() {
  // Use JSON files because CSV loses the separate visit_uv_new/visit_uv arrays
  const dailyJson = await readJsonFilesByType('dailyRetain');
  const weeklyJson = await readJsonFilesByType('weeklyRetain');
  const monthlyJson = await readJsonFilesByType('monthlyRetain');

  function parseRetainJson(jsonList) {
    const byDate = {};
    for (const item of jsonList) {
      const raw = item.raw;
      const refDate = raw.ref_date || '';
      if (!byDate[refDate]) byDate[refDate] = { newUv: [], allUv: [] };

      const newUv = raw.visit_uv_new || [];
      const allUv = raw.visit_uv || [];

      for (const kv of newUv) {
        byDate[refDate].newUv.push({ key: Number(kv.key), value: Number(kv.value) });
      }
      for (const kv of allUv) {
        byDate[refDate].allUv.push({ key: Number(kv.key), value: Number(kv.value) });
      }
    }
    return byDate;
  }

  const dailyRetByDate = parseRetainJson(dailyJson);
  const weeklyRetByDate = parseRetainJson(weeklyJson);

  // Compute average daily retention rates
  function computeRetentionRates(byDate) {
    const dates = Object.keys(byDate).sort();
    const rates = [];
    for (const date of dates) {
      const { newUv, allUv } = byDate[date];
      const day0New = newUv.find(e => e.key === 0);
      const day1New = newUv.find(e => e.key === 1);
      const day0All = allUv.find(e => e.key === 0);
      const day1All = allUv.find(e => e.key === 1);
      if (day0New && day0New.value > 0) {
        rates.push({
          date,
          day0_new: day0New.value,
          day1_new: day1New ? day1New.value : 0,
          retention_new: day1New ? day1New.value / day0New.value : 0,
          day0_all: day0All ? day0All.value : 0,
          day1_all: day1All ? day1All.value : 0,
          retention_all: (day1All && day0All && day0All.value > 0) ? day1All.value / day0All.value : 0
        });
      }
    }
    return rates;
  }

  const dailyRates = computeRetentionRates(dailyRetByDate);
  const weeklyRates = computeRetentionRates(weeklyRetByDate);
  const monthlyRates = computeRetentionRates(parseRetainJson(monthlyJson));

  // Average retention
  const avgDailyNewRet = dailyRates.length > 0
    ? dailyRates.reduce((s, r) => s + r.retention_new, 0) / dailyRates.length : 0;
  const avgDailyAllRet = dailyRates.length > 0
    ? dailyRates.reduce((s, r) => s + r.retention_all, 0) / dailyRates.length : 0;

  // Recent daily retention (last 30)
  const recentDaily = dailyRates.slice(-30);
  const recentAvgNewRet = recentDaily.length > 0
    ? recentDaily.reduce((s, r) => s + r.retention_new, 0) / recentDaily.length : 0;

  return {
    dailyRates,
    weeklyRates,
    monthlyRates,
    avgDailyNewRetention: avgDailyNewRet,
    avgDailyAllRetention: avgDailyAllRet,
    recent30DayNewRetention: recentAvgNewRet,
    totalDailyDataPoints: dailyRates.length,
    // Day-1 retention distribution
    day1NewRetentionDist: dailyRates.map(r => r.retention_new).sort((a, b) => a - b),
    // Weeks with any retention
    weeklyRetentionSummary: weeklyRates.map(r => ({
      date: r.date,
      newRetention: r.retention_new,
      allRetention: r.retention_all,
      newUsers: r.day0_new
    })),
    monthlyRetentionSummary: monthlyRates.map(r => ({
      date: r.date,
      newRetention: r.retention_new,
      allRetention: r.retention_all,
      newUsers: r.day0_new
    }))
  };
}

// ============ 3. 页面访问分析 ============
async function analyzePages() {
  const rows = await readAllCsvByType('visitPage');
  if (!rows.length) return null;

  // Aggregate by page path
  const pageStats = {};
  for (const r of rows) {
    const path = r.page_path || '';
    if (!pageStats[path]) {
      pageStats[path] = {
        path,
        totalVisits: 0,
        totalPV: 0,
        totalStay: 0,
        count: 0,
        dates: new Set()
      };
    }
    pageStats[path].totalPV += num(r.page_visit_pv);
    pageStats[path].totalVisits += num(r.page_visit_uv);
    pageStats[path].totalStay += num(r.page_staytime_pv);
    pageStats[path].count++;
    pageStats[path].dates.add(r.ref_date);
  }

  const pages = Object.values(pageStats).map(p => ({
    ...p,
    avgPV: p.totalPV / p.count,
    avgVisits: p.totalVisits / p.count,
    avgStay: p.count > 0 ? p.totalStay / p.totalPV : 0,
    dateCount: p.dates.size
  }));
  pages.sort((a, b) => b.totalPV - a.totalPV);

  // Recent page data (last 2 pulls)
  const sortedDates = [...new Set(rows.map(r => r.ref_date))].sort();
  const recentDates = sortedDates.slice(-3);
  const recentPages = {};
  for (const r of rows) {
    if (recentDates.includes(r.ref_date)) {
      const path = r.page_path || '';
      if (!recentPages[path]) recentPages[path] = { path, totalPV: 0, totalVisits: 0, totalStay: 0, count: 0 };
      recentPages[path].totalPV += num(r.page_visit_pv);
      recentPages[path].totalVisits += num(r.page_visit_uv);
      recentPages[path].totalStay += num(r.page_staytime_pv);
      recentPages[path].count++;
    }
  }
  const recentPageList = Object.values(recentPages).map(p => ({
    ...p,
    avgPV: p.totalPV / (p.count || 1),
    avgVisits: p.totalVisits / (p.count || 1),
    avgStay: p.totalPV > 0 ? p.totalStay / p.totalPV : 0
  }));
  recentPageList.sort((a, b) => b.avgPV - a.avgPV);

  return {
    allPages: pages,
    recentPages: recentPageList,
    totalUniquePages: pages.length,
    topPagesByPV: pages.slice(0, 10),
    topPagesByStay: [...pages].sort((a, b) => b.avgStay - a.avgStay).slice(0, 10)
  };
}

// ============ 4. 访问分布分析 ============
async function analyzeDistribution() {
  // Use JSON - CSV stores item_list as JSON string which is harder to parse
  const jsonList = await readJsonFilesByType('visitDistribution');
  if (!jsonList.length) return null;

  // Parse from JSON
  const distByDate = {};
  for (const item of jsonList) {
    const raw = item.raw;
    const date = raw.ref_date || '';
    if (!distByDate[date]) distByDate[date] = {};
    const list = raw.list || [];
    for (const section of list) {
      const index = section.index || '';
      if (!distByDate[date][index]) distByDate[date][index] = [];
      for (const kv of (section.item_list || [])) {
        distByDate[date][index].push({ key: Number(kv.key), value: Number(kv.value) });
      }
    }
  }

  // Access source labels (session_cnt based)
  const sourceLabels = {
    1: '小程序历史列表', 2: '搜索', 3: '会话', 4: '二维码',
    5: '公众号主页', 6: '聊天顶部', 7: '系统桌面', 8: '小程序主页',
    9: '附近的小程序', 10: '其他小程序', 11: '广告', 12: '客服消息',
    13: '公众号文章', 14: '钱包', 15: '卡包', 16: '小程序卡',
    17: '小程序提示', 18: '小程序直播', 19: '微信支付',
    20: '发现入口', 21: '发现-小程序', 22: '小程序互跳',
    27: '视频号', 28: '视频号直播', 29: '小程序任务',
    30: '企业微信', 31: '公众号关注', 35: '短信',
    36: '微信外网页', 37: '小程序订阅消息', 38: '支付后',
    39: '小程序搜索', 40: '视频号推荐', 41: '下拉任务栏',
    42: '小程序助手', 43: '交易组件'
  };

  const stayLabels = {
    1: '0-2s', 2: '3-5s', 3: '6-10s', 4: '11-20s',
    5: '20-30s', 6: '30-50s', 7: '50-100s', 8: '>100s'
  };

  const depthLabels = {
    1: '1页', 2: '2页', 3: '3页', 4: '4页', 5: '5页', 6: '6-10页'
  };

  // Aggregate most recent data
  const dates = Object.keys(distByDate).sort();
  const recentDates = dates.slice(-14);

  // Aggregate source across recent dates
  const sourceAgg = {};
  const stayAgg = {};
  const depthAgg = {};

  for (const date of recentDates) {
    const day = distByDate[date];
    for (const item of (day['access_source_session_cnt'] || [])) {
      if (!sourceAgg[item.key]) sourceAgg[item.key] = 0;
      sourceAgg[item.key] += item.value;
    }
    for (const item of (day['access_staytime_info'] || [])) {
      if (!stayAgg[item.key]) stayAgg[item.key] = 0;
      stayAgg[item.key] += item.value;
    }
    for (const item of (day['access_depth_info'] || [])) {
      if (!depthAgg[item.key]) depthAgg[item.key] = 0;
      depthAgg[item.key] += item.value;
    }
  }

  const totalSourceSessions = Object.values(sourceAgg).reduce((s, v) => s + v, 0);
  const totalStaySessions = Object.values(stayAgg).reduce((s, v) => s + v, 0);
  const totalDepthSessions = Object.values(depthAgg).reduce((s, v) => s + v, 0);

  return {
    sourceAgg: Object.entries(sourceAgg)
      .map(([k, v]) => ({ key: Number(k), label: sourceLabels[Number(k)] || `未知(${k})`, value: v, ratio: totalSourceSessions > 0 ? v / totalSourceSessions : 0 }))
      .sort((a, b) => b.value - a.value),
    stayAgg: Object.entries(stayAgg)
      .map(([k, v]) => ({ key: Number(k), label: stayLabels[Number(k)] || `未知(${k})`, value: v, ratio: totalStaySessions > 0 ? v / totalStaySessions : 0 }))
      .sort((a, b) => a.key - b.key),
    depthAgg: Object.entries(depthAgg)
      .map(([k, v]) => ({ key: Number(k), label: depthLabels[Number(k)] || `未知(${k})`, value: v, ratio: totalDepthSessions > 0 ? v / totalDepthSessions : 0 }))
      .sort((a, b) => a.key - b.key)
  };
}

// ============ 5. 用户画像分析 ============
async function analyzePortrait() {
  let files;
  try { files = await fsp.readdir(DATA_DIR); } catch { return null; }
  const portraitFiles = files.filter(f => f.startsWith('userPortrait-') && f.endsWith('.json')).sort();
  if (!portraitFiles.length) return null;

  // Read most recent portrait
  const latest = portraitFiles[portraitFiles.length - 1];
  const data = JSON.parse(await fsp.readFile(path.join(DATA_DIR, latest), 'utf8'));
  const raw = data.raw;

  function extractTop(prop, limit = 5) {
    const items = (raw.visit_uv_new && raw.visit_uv_new[prop]) || [];
    return items.filter(i => i.value > 0).sort((a, b) => b.value - a.value).slice(0, limit);
  }

  function extractAll(prop) {
    const items = (raw.visit_uv_new && raw.visit_uv_new[prop]) || [];
    return items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  }

  return {
    refDate: raw.ref_date,
    newUserProvinces: extractAll('province'),
    newUserCities: extractAll('city'),
    newUserGenders: extractAll('gender'),
    newUserAges: extractAll('age'),
    newUserPlatforms: extractAll('platform'),
    newUserDevices: extractAll('device'),
    topProvinces: extractTop('province', 5),
    topCities: extractTop('city', 5),
    genderDist: extractAll('gender'),
    ageDist: extractAll('age'),
    platformDist: extractAll('platform'),
    deviceDist: extractAll('device')
  };
}

// ============ 6. 日汇总分析 ============
async function analyzeSummary() {
  const rows = await readAllCsvByType('dailySummary');
  if (!rows.length) return null;

  const avg = arr => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
  const sum = arr => arr.reduce((s, v) => s + v, 0);

  const visits = rows.map(r => num(r.visit_total));
  const shares_pv = rows.map(r => num(r.share_pv));
  const shares_uv = rows.map(r => num(r.share_uv));

  const last30 = rows.slice(-30);

  return {
    totalDays: rows.length,
    avgDailyVisits: avg(visits),
    avgDailySharesPV: avg(shares_pv),
    avgDailySharesUV: avg(shares_uv),
    totalVisits: sum(visits),
    totalSharesPV: sum(shares_pv),
    totalSharesUV: sum(shares_uv),
    shareRate: sum(shares_pv) > 0 ? sum(shares_uv) / sum(visits) : 0,
    last30AvgVisits: avg(last30.map(r => num(r.visit_total))),
    last30AvgShares: avg(last30.map(r => num(r.share_uv))),
    last30TotalVisits: sum(last30.map(r => num(r.visit_total)))
  };
}

// ============ 主函数 ============
async function main() {
  console.log('========================================');
  console.log('  小程序 we 分析 - 全面数据报告');
  console.log('========================================\n');

  // 1. 访问趋势
  console.log('━━━ 1. 访问趋势分析 ━━━');
  const visitTrend = await analyzeVisitTrend();
  if (visitTrend) {
    console.log(`  数据范围: ${visitTrend.dateRange} (${visitTrend.totalDays} 天)`);
    console.log(`  全时期日均 UV: ${visitTrend.allTimeAvg.uv.toFixed(1)} (新用户 ${visitTrend.allTimeAvg.uv_new.toFixed(1)}, 新用户占比 ${pct(visitTrend.allTimeAvg.newUserRatio)})`);
    console.log(`  全时期日均 PV: ${visitTrend.allTimeAvg.pv.toFixed(1)}`);
    console.log(`  全时期日均启动次数: ${visitTrend.allTimeAvg.session.toFixed(1)}`);
    console.log(`  全时期人均停留时长: ${visitTrend.allTimeAvg.stay_uv.toFixed(1)}s`);
    console.log(`  全时期次均停留时长: ${visitTrend.allTimeAvg.stay_session.toFixed(1)}s`);
    console.log(`  全时期平均访问深度: ${visitTrend.allTimeAvg.depth.toFixed(2)} 页`);

    console.log(`\n  前半段 (${visitTrend.firstHalfAvg.uv.toFixed(1)} UV) vs 后半段 (${visitTrend.secondHalfAvg.uv.toFixed(1)} UV):`);
    console.log(`    UV 变化: ${visitTrend.changes.uv}`);
    console.log(`    新用户 UV 变化: ${visitTrend.changes.uv_new}`);
    console.log(`    PV 变化: ${visitTrend.changes.pv}`);
    console.log(`    启动次数变化: ${visitTrend.changes.session}`);
    console.log(`    人均停留变化: ${visitTrend.changes.stay_uv}`);
    console.log(`    访问深度变化: ${visitTrend.changes.depth}`);

    console.log(`\n  最近 7 天均值:`);
    console.log(`    UV: ${visitTrend.last7Avg.uv.toFixed(1)} (新用户 ${visitTrend.last7Avg.uv_new.toFixed(1)}, 占比 ${pct(visitTrend.last7Avg.newUserRatio)})`);
    console.log(`    PV: ${visitTrend.last7Avg.pv.toFixed(1)}`);
    console.log(`    启动次数: ${visitTrend.last7Avg.session.toFixed(1)}`);
    console.log(`    人均停留: ${visitTrend.last7Avg.stay_uv.toFixed(1)}s`);
    console.log(`    访问深度: ${visitTrend.last7Avg.depth.toFixed(2)} 页`);

    console.log(`\n  最近 30 天均值:`);
    console.log(`    UV: ${visitTrend.last30Avg.uv.toFixed(1)} (新用户 ${visitTrend.last30Avg.uv_new.toFixed(1)}, 占比 ${pct(visitTrend.last30Avg.newUserRatio)})`);
    console.log(`    人均停留: ${visitTrend.last30Avg.stay_uv.toFixed(1)}s`);
    console.log(`    访问深度: ${visitTrend.last30Avg.depth.toFixed(2)} 页`);

    // Weekend vs weekday
    const weekendAvg = visitTrend.weekendDays.length > 0
      ? visitTrend.weekendDays.reduce((s, d) => s + d.visit_uv, 0) / visitTrend.weekendDays.length : 0;
    const weekdayAvg = visitTrend.weekdayDays.length > 0
      ? visitTrend.weekdayDays.reduce((s, d) => s + d.visit_uv, 0) / visitTrend.weekdayDays.length : 0;
    console.log(`\n  周末均值 UV: ${weekendAvg.toFixed(1)} vs 工作日均值 UV: ${weekdayAvg.toFixed(1)}`);
  }

  // 2. 留存分析
  console.log('\n━━━ 2. 用户留存分析 ━━━');
  const retention = await analyzeRetention();
  if (retention) {
    console.log(`  日留存数据: ${retention.totalDailyDataPoints} 天`);
    console.log(`  全部时期新用户次日留存率均值: ${pct(retention.avgDailyNewRetention)}`);
    console.log(`  全部时期全部用户次日留存率均值: ${pct(retention.avgDailyAllRetention)}`);
    console.log(`  近30天新用户次日留存率均值: ${pct(retention.recent30DayNewRetention)}`);

    // Distribution of day-1 retention
    const dist = retention.day1NewRetentionDist;
    if (dist.length > 0) {
      const zeroCount = dist.filter(v => v === 0).length;
      console.log(`  次日留存 = 0% 的天数: ${zeroCount}/${dist.length} (${pct(zeroCount/dist.length)})`);
      const nonZero = dist.filter(v => v > 0);
      if (nonZero.length > 0) {
        const max = Math.max(...nonZero);
        const nonZeroAvg = nonZero.reduce((s, v) => s + v, 0) / nonZero.length;
        console.log(`  非零留存天数: ${nonZero.length}, 均值: ${pct(nonZeroAvg)}, 最高: ${pct(max)}`);
      }
    }

    // Weekly retention
    if (retention.weeklyRetentionSummary.length > 0) {
      console.log(`\n  周留存趋势:`);
      for (const w of retention.weeklyRetentionSummary.slice(-8)) {
        console.log(`    ${w.date}: 新用户 ${w.newUsers}人, 周留存 ${pct(w.newRetention)}`);
      }
    }

    // Monthly retention
    if (retention.monthlyRetentionSummary.length > 0) {
      console.log(`\n  月留存趋势:`);
      for (const m of retention.monthlyRetentionSummary) {
        console.log(`    ${m.date}: 新用户 ${m.newUsers}人, 月留存 ${pct(m.newRetention)}`);
      }
    }

    // Last 10 days detail
    if (retention.dailyRates.length > 0) {
      console.log(`\n  最近10天日留存详情:`);
      for (const r of retention.dailyRates.slice(-10)) {
        console.log(`    ${r.date}: 新用户${r.day0_new}人 → 次日留存${r.day1_new}人 (${pct(r.retention_new)}) | 全用户${r.day0_all}人 → 次日${r.day1_all}人 (${pct(r.retention_all)})`);
      }
    }
  }

  // 3. 页面分析
  console.log('\n━━━ 3. 页面访问分析 ━━━');
  const pages = await analyzePages();
  if (pages) {
    console.log(`  独立页面数: ${pages.totalUniquePages}`);
    console.log(`\n  全部时期 Top 10 页面 (按 PV):`);
    for (const p of pages.topPagesByPV) {
      console.log(`    ${p.path}: 累计PV ${p.totalPV}, 日均PV ${p.avgPV.toFixed(1)}, 日均UV ${p.avgVisits.toFixed(1)}, 平均停留 ${p.avgStay.toFixed(1)}s`);
    }
    console.log(`\n  Top 停留时长页面:`);
    for (const p of pages.topPagesByStay.slice(0, 5)) {
      console.log(`    ${p.path}: 平均停留 ${p.avgStay.toFixed(1)}s`);
    }
    if (pages.recentPages.length > 0) {
      console.log(`\n  最近几天页面分布:`);
      for (const p of pages.recentPages.slice(0, 5)) {
        console.log(`    ${p.path}: 日均PV ${p.avgPV.toFixed(1)}, 日均UV ${p.avgVisits.toFixed(1)}, 平均停留 ${p.avgStay.toFixed(1)}s`);
      }
    }
  }

  // 4. 访问分布
  console.log('\n━━━ 4. 访问来源分布 (近14天汇总) ━━━');
  const dist = await analyzeDistribution();
  if (dist) {
    console.log('  访问来源:');
    for (const s of dist.sourceAgg) {
      console.log(`    ${s.label}: ${s.value} 次 (${pct(s.ratio)})`);
    }
    console.log('\n  停留时长分布:');
    for (const s of dist.stayAgg) {
      console.log(`    ${s.label}: ${s.value} 次 (${pct(s.ratio)})`);
    }
    console.log('\n  访问深度分布:');
    for (const s of dist.depthAgg) {
      console.log(`    ${s.label}: ${s.value} 次 (${pct(s.ratio)})`);
    }
  }

  // 5. 用户画像
  console.log('\n━━━ 5. 用户画像分析 (最新) ━━━');
  const portrait = await analyzePortrait();
  if (portrait) {
    console.log(`  数据日期: ${portrait.refDate}`);
    if (portrait.genderDist.length > 0) {
      console.log('  性别分布 (新用户):');
      for (const g of portrait.genderDist) {
        const labels = { 1: '男', 2: '女', 0: '未知' };
        console.log(`    ${labels[g.id] || g.name || g.id}: ${g.value} 人`);
      }
    }
    if (portrait.ageDist.length > 0) {
      console.log('  年龄分布 (新用户):');
      const ageLabels = { 1: '17岁以下', 2: '18-24岁', 3: '25-29岁', 4: '30-39岁', 5: '40-49岁', 6: '50岁以上' };
      for (const a of portrait.ageDist) {
        console.log(`    ${ageLabels[a.id] || a.name || a.id}: ${a.value} 人`);
      }
    }
    if (portrait.platformDist.length > 0) {
      console.log('  平台分布 (新用户):');
      const platLabels = { 1: 'iPhone', 2: 'Android', 15: 'iPad', 26: 'Android Pad', 28: 'Mac', 37: 'Windows' };
      for (const p of portrait.platformDist) {
        console.log(`    ${platLabels[p.id] || p.name || p.id}: ${p.value} 人`);
      }
    }
    if (portrait.topProvinces.length > 0) {
      console.log('  Top 省份 (新用户):');
      for (const p of portrait.topProvinces) {
        console.log(`    ${p.name}: ${p.value} 人`);
      }
    }
    if (portrait.topCities.length > 0) {
      console.log('  Top 城市 (新用户):');
      for (const c of portrait.topCities) {
        console.log(`    ${c.name}: ${c.value} 人`);
      }
    }
  }

  // 6. 日汇总
  console.log('\n━━━ 6. 日汇总指标 ━━━');
  const summary = await analyzeSummary();
  if (summary) {
    console.log(`  日均访问量 (visit_total): ${summary.avgDailyVisits.toFixed(1)}`);
    console.log(`  总访问量: ${summary.totalVisits}`);
    console.log(`  日均分享人数: ${summary.avgDailySharesUV.toFixed(2)}`);
    console.log(`  日均分享次数: ${summary.avgDailySharesPV.toFixed(2)}`);
    console.log(`  分享率 (分享UV/访问量): ${pct(summary.shareRate)}`);
    console.log(`  近30天日均访问量: ${summary.last30AvgVisits.toFixed(1)}`);
  }

  // 7. 综合诊断
  console.log('\n========================================');
  console.log('  综合诊断与建议');
  console.log('========================================\n');

  if (retention) {
    console.log('【留存诊断】');
    if (retention.avgDailyNewRetention < 0.05) {
      console.log('  🔴 新用户次日留存率极低 (<5%)，用户\"用完即走\"现象严重');
      console.log('  💡 建议: 增加新用户引导流程、首次使用奖励、推送提醒机制');
    } else if (retention.avgDailyNewRetention < 0.15) {
      console.log('  🟡 新用户次日留存率偏低 (5%-15%)');
      console.log('  💡 建议: 优化首次体验，增加\"再玩一局\"引导');
    } else {
      console.log('  🟢 新用户留存率正常');
    }

    const zeroRetentionRatio = retention.day1NewRetentionDist.filter(v => v === 0).length / Math.max(retention.day1NewRetentionDist.length, 1);
    if (zeroRetentionRatio > 0.6) {
      console.log(`  🔴 ${pct(zeroRetentionRatio)} 的日子里次日留存为 0，说明用户回访极其不稳定`);
    }
  }

  if (visitTrend) {
    console.log('\n【访问趋势诊断】');
    const newRatio30 = visitTrend.last30Avg.newUserRatio;
    console.log(`  近30天新用户占比: ${pct(newRatio30)}`);
    if (newRatio30 > 0.5) {
      console.log('  🟡 新用户占比偏高 (>50%)，说明老用户留存不足，依赖新用户拉新');
      console.log('  💡 建议: 加强老用户召回机制，如赛事提醒、战绩分享、排行榜更新通知');
    }

    const stayTime = visitTrend.last30Avg.stay_uv;
    console.log(`  近30天人均停留: ${stayTime.toFixed(1)}s`);
    if (stayTime < 60) {
      console.log('  🔴 人均停留时长 <60s，用户使用深度不足');
      console.log('  💡 建议: 增加赛事互动功能、数据统计分析、社区/评论功能');
    } else if (stayTime < 180) {
      console.log('  🟡 人均停留时长 60-180s，中等水平');
    }

    const depth = visitTrend.last30Avg.depth;
    console.log(`  近30天访问深度: ${depth.toFixed(2)} 页`);
    if (depth < 2) {
      console.log('  🔴 访问深度 <2 页，用户浏览意愿低');
    }

    // Trend direction
    const uvChange = parseFloat(visitTrend.changes.uv);
    if (uvChange < -10) {
      console.log(`  🔴 UV 呈下降趋势 (${visitTrend.changes.uv})`);
    } else if (uvChange < 0) {
      console.log(`  🟡 UV 略有下降 (${visitTrend.changes.uv})`);
    } else {
      console.log(`  🟢 UV 呈增长趋势 (${visitTrend.changes.uv})`);
    }
  }

  if (dist) {
    console.log('\n【来源诊断】');
    const sessionSource = dist.sourceAgg.find(s => s.label === '会话');
    const searchSource = dist.sourceAgg.find(s => s.label === '搜索');
    const taskbarSource = dist.sourceAgg.find(s => s.label === '下拉任务栏');

    if (sessionSource) {
      console.log(`  会话 (分享进入) 占比: ${pct(sessionSource.ratio)}`);
      if (sessionSource.ratio > 0.5) {
        console.log('  💡 大部分流量来自分享，分享是核心增长渠道');
      }
    }
    if (taskbarSource) {
      console.log(`  下拉任务栏 (主动回访) 占比: ${pct(taskbarSource.ratio)}`);
      if (taskbarSource.ratio < 0.1) {
        console.log('  🟡 主动回访比例低，用户不会主动想起使用');
      }
    }
    if (searchSource) {
      console.log(`  搜索占比: ${pct(searchSource.ratio)}`);
    }
  }

  if (summary) {
    console.log('\n【分享诊断】');
    console.log(`  分享率: ${pct(summary.shareRate)}`);
    if (summary.shareRate < 0.02) {
      console.log('  🟡 分享率偏低，病毒传播能力弱');
      console.log('  💡 建议: 优化分享卡片设计，增加分享激励（如\"分享战绩领优惠\"）');
    }
    if (summary.last30AvgShares < 1) {
      console.log('  🔴 日均分享人数 <1，几乎没有自然传播');
    }
  }

  // Performance-related observations
  console.log('\n【性能相关观察】');
  if (visitTrend) {
    const bounceRate = visitTrend.allTimeAvg.depth < 1.5 ? '高' : '中低';
    console.log(`  跳出率推测: ${bounceRate} (访问深度 ${visitTrend.allTimeAvg.depth.toFixed(2)} 页)`);
    console.log(`  次均停留: ${visitTrend.allTimeAvg.stay_session.toFixed(1)}s (该指标反映单次会话质量)`);
  }

  // Save report
  const report = {
    generatedAt: new Date().toISOString(),
    visitTrend: visitTrend ? {
      dateRange: visitTrend.dateRange,
      allTimeAvg: visitTrend.allTimeAvg,
      last7Avg: visitTrend.last7Avg,
      last30Avg: visitTrend.last30Avg,
      changes: visitTrend.changes
    } : null,
    retention: retention ? {
      avgDailyNewRetention: retention.avgDailyNewRetention,
      avgDailyAllRetention: retention.avgDailyAllRetention,
      recent30DayNewRetention: retention.recent30DayNewRetention,
      monthlyRetentionSummary: retention.monthlyRetentionSummary,
      weeklyRetentionSummary: retention.weeklyRetentionSummary
    } : null,
    pages: pages ? {
      topPagesByPV: pages.topPagesByPV,
      topPagesByStay: pages.topPagesByStay
    } : null,
    distribution: dist ? {
      sourceAgg: dist.sourceAgg,
      stayAgg: dist.stayAgg,
      depthAgg: dist.depthAgg
    } : null,
    portrait: portrait ? {
      genderDist: portrait.genderDist,
      ageDist: portrait.ageDist,
      platformDist: portrait.platformDist,
      topProvinces: portrait.topProvinces
    } : null,
    summary
  };

  const reportPath = path.join(DATA_DIR, `analysis-report-${new Date().toISOString().slice(0, 10)}.json`);
  await fsp.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 报告已保存至: ${reportPath}`);
}

main().catch(err => {
  console.error('分析失败:', err);
  process.exitCode = 1;
});
