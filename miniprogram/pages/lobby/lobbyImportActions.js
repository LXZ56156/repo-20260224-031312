const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const nav = require('../../core/nav');

const FLOWER_MARK_RE = /[🌺🌸]/g;
const CIRCLED_INDEX_MARKS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

function normalizeGenderMark(mark) {
  const value = String(mark || '').trim().toLowerCase();
  if (value === '男' || value === 'm') return 'male';
  if (value === '女' || value === 'f') return 'female';
  if (value === 'male' || value === '♂') return 'male';
  if (value === 'female' || value === '♀') return 'female';
  return '';
}

function stripStatusNotes(raw) {
  return String(raw || '')
    .replace(/[✅✔☑√]/g, ' ')
    .replace(/\s*[\(（【\[]\s*(?:已付款|已付|已转账|已转|已支付|已交|已缴费|已缴|已报名|确认|代付|paid|done|ok)\s*[\)）】\]]\s*$/i, '')
    .replace(/\s*(?:已付款|已付|已转账|已转|已支付|已交|已缴费|已缴|已报名|确认|代付|paid|done|ok)\s*$/i, '')
    .trim();
}

function parseExplicitGender(raw) {
  const text = stripStatusNotes(raw);
  const patterns = [
    /^(.+?)\s*[\/|]\s*(男|女|m|f|male|female|♂|♀)$/i,
    /^(.+?)\s*[\(（]\s*[^()（）]*(男|女|m|f|male|female|♂|♀)[^()（）]*[\)）]\s*$/i,
    /^(.+?)\s*[-－—]\s*(男|女|m|f|male|female|♂|♀)$/i,
    /^(.+?)\s+(男|女|m|f|male|female|♂|♀)$/i,
    /^(.+?)(♂|♀)$/i
  ];
  for (const pattern of patterns) {
    const matched = pattern.exec(text);
    if (!matched) continue;
    const gender = normalizeGenderMark(matched[2]);
    if (!gender) continue;
    return {
      name: String(matched[1] || '').trim(),
      gender
    };
  }
  return null;
}

function trimNameEdges(text) {
  return String(text || '')
    .replace(/^[\s,，;；、.．:：\-—|/]+/, '')
    .replace(/[\s,，;；、.．:：\-—|/]+$/, '')
    .trim();
}

function cleanImportName(raw) {
  let name = stripStatusNotes(String(raw || '').replace(FLOWER_MARK_RE, ' '));
  name = name.replace(/[\(（【\[].*$/, '');
  name = name.replace(/\s*(?:我)?让\s*[\d一二三四五六七八九十]+\s*分.*$/i, '');
  name = name.replace(/\s*\d{1,2}(?:点|:|：)\d{0,2}\s*(?:分)?\s*(?:到|左右|以后|前)?.*$/, '');
  name = name.replace(/\s*(?:教练|老师)\s*$/, '');
  name = trimNameEdges(name);
  name = name.replace(/\s*\+\s*/g, '+');
  return name.replace(/\s+/g, ' ').trim();
}

function isEmptySlotName(name) {
  return !name || /^[\d\s.．、\)）:：\-—]+$/.test(name);
}

function parseImportPlayerToken(token, fallbackGender = 'unknown') {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const hasFlowerMark = FLOWER_MARK_RE.test(raw);
  FLOWER_MARK_RE.lastIndex = 0;
  const explicit = parseExplicitGender(raw);
  const name = cleanImportName(explicit ? explicit.name : raw);
  if (isEmptySlotName(name)) return null;
  let gender = String(fallbackGender || '').trim() || 'unknown';
  if (gender !== 'male' && gender !== 'female') gender = 'unknown';
  if (hasFlowerMark) gender = 'female';
  if (explicit && explicit.gender) gender = explicit.gender;
  return { name, gender };
}

function isStandaloneGenderToken(token) {
  return Boolean(normalizeGenderMark(token));
}

function isStatusOnlyToken(token) {
  const value = String(token || '').trim();
  if (!value) return true;
  if (/^[✅✔☑√]+$/.test(value)) return true;
  return /^(?:已付款|已付|已转账|已转|已支付|已交|已缴费|已缴|已报名|确认|代付|paid|done|ok)$/i.test(value);
}

function isEventInfoChunk(chunk) {
  const value = String(chunk || '').replace(/\s+/g, '');
  if (!value) return true;
  const hasEventLabel = /(时间|日期|费用|球费|场地|地点|地址|用球|奖品|奖项|人数|限制|名额|截止|规则|说明|备注|AA)/i.test(value);
  if (!hasEventLabel) return false;
  return /[:：\d]/.test(value);
}

function inferGroupGender(line, currentGender) {
  const compact = String(line || '').replace(/\s+/g, '');
  const hasMaleGroup = /(男双|男单|男子|男队|男组|男生|男士|男球友|^男(?:[:：、,，;；]|$))/.test(compact);
  const hasFemaleGroup = /(女双|女单|女子|女队|女组|女生|女士|女球友|^女(?:[:：、,，;；]|$))/.test(compact);
  if (hasMaleGroup && !hasFemaleGroup) return 'male';
  if (hasFemaleGroup && !hasMaleGroup) return 'female';
  return (currentGender === 'male' || currentGender === 'female') ? currentGender : 'unknown';
}

function collectNumberMarkers(line) {
  const markers = [];
  const unitAfterNumberRe = /[点时分秒元块支场局号人位名个月日等]/;
  const markerRe = /(^|[\s,，;；、:：])([1-9]\d?)(?!\d)([.．、\)）:：-]?)(\s*)/g;
  let matched = null;
  while ((matched = markerRe.exec(line)) !== null) {
    const markerStart = matched.index + String(matched[1] || '').length;
    const digits = String(matched[2] || '');
    const punctuation = String(matched[3] || '');
    const digitsEnd = markerStart + digits.length;
    const contentStart = matched.index + String(matched[0] || '').length;
    const afterDigits = line.charAt(digitsEnd);
    const afterConsumed = line.charAt(contentStart);
    if (line.slice(digitsEnd, digitsEnd + 2) === '\uFE0F\u20E3' || line.charAt(digitsEnd) === '\u20E3') continue;
    if (!punctuation && (unitAfterNumberRe.test(afterDigits) || unitAfterNumberRe.test(afterConsumed) || afterDigits === '/' || afterDigits === '／')) continue;
    if ((punctuation === ':' || punctuation === '：') && /\d/.test(afterConsumed)) continue;
    markers.push({ markerStart, contentStart });
  }

  const tenKeycapSequenceRe = /(^|[\s,，;；、:：])10(?:\uFE0F?\u20E3)\s*/g;
  while ((matched = tenKeycapSequenceRe.exec(line)) !== null) {
    const markerStart = matched.index + String(matched[1] || '').length;
    markers.push({ markerStart, contentStart: matched.index + String(matched[0] || '').length });
  }

  const bracketedMarkerRe = /(^|[\s,，;；、:：])[\(（【\[]\s*([1-9]\d?)\s*[\)）】\]]\s*/g;
  while ((matched = bracketedMarkerRe.exec(line)) !== null) {
    const markerStart = matched.index + String(matched[1] || '').length;
    markers.push({ markerStart, contentStart: matched.index + String(matched[0] || '').length });
  }

  const keycapMarkerRe = /(^|[\s,，;；、:：])([1-9])(?:\uFE0F?\u20E3)\s*/g;
  while ((matched = keycapMarkerRe.exec(line)) !== null) {
    const markerStart = matched.index + String(matched[1] || '').length;
    markers.push({ markerStart, contentStart: matched.index + String(matched[0] || '').length });
  }

  const tenKeycapMarkerRe = /(^|[\s,，;；、:：])🔟\s*/g;
  while ((matched = tenKeycapMarkerRe.exec(line)) !== null) {
    const markerStart = matched.index + String(matched[1] || '').length;
    markers.push({ markerStart, contentStart: matched.index + String(matched[0] || '').length });
  }

  for (let i = 0; i < line.length; i += 1) {
    if (!CIRCLED_INDEX_MARKS.includes(line.charAt(i))) continue;
    markers.push({ markerStart: i, contentStart: i + 1 });
  }

  return markers
    .sort((a, b) => a.markerStart - b.markerStart)
    .filter((marker, index, list) => index === 0 || marker.markerStart !== list[index - 1].markerStart);
}

function extractNumberedItemsFromLine(line) {
  const markers = collectNumberMarkers(line);
  if (!markers.length) return [];
  return markers.map((marker, index) => {
    const next = markers[index + 1];
    const end = next ? next.markerStart : line.length;
    return trimNameEdges(line.slice(marker.contentStart, end));
  });
}

function parseNumberedImportPlayers(raw) {
  const out = [];
  let foundNumbered = false;
  let currentGender = 'unknown';
  const lines = String(raw || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) continue;
    currentGender = inferGroupGender(line, currentGender);
    const items = extractNumberedItemsFromLine(line);
    if (!items.length) continue;
    foundNumbered = true;
    for (const item of items) {
      const player = parseImportPlayerToken(item, currentGender);
      if (player) out.push(player);
    }
  }
  return { foundNumbered, players: out };
}

function parseSimpleImportPlayers(raw) {
  const out = [];
  const chunks = String(raw || '').split(/[\n,，;；\t、]+/);
  for (const rawChunk of chunks) {
    const chunk = String(rawChunk || '').trim();
    if (!chunk) continue;
    if (isEventInfoChunk(chunk)) continue;
    const pieces = chunk.split(/\s+/).filter(Boolean);
    const genderIndexes = pieces
      .map((piece, index) => isStandaloneGenderToken(piece) ? index : -1)
      .filter((index) => index >= 0);
    if (
      pieces.length <= 3 &&
      genderIndexes.length === 1 &&
      genderIndexes[0] === 1 &&
      pieces.slice(2).every(isStatusOnlyToken)
    ) {
      const player = parseImportPlayerToken(chunk, 'unknown');
      if (player) out.push(player);
      continue;
    }
    if (pieces.length <= 1) {
      const player = parseImportPlayerToken(chunk, 'unknown');
      if (player) out.push(player);
      continue;
    }
    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i];
      if (isStatusOnlyToken(piece)) continue;
      if (isStandaloneGenderToken(pieces[i + 1])) {
        const parts = [piece, pieces[i + 1]];
        if (isStatusOnlyToken(pieces[i + 2])) {
          parts.push(pieces[i + 2]);
          i += 1;
        }
        const player = parseImportPlayerToken(parts.join(' '), 'unknown');
        if (player) out.push(player);
        i += 1;
        continue;
      }
      const player = parseImportPlayerToken(piece, 'unknown');
      if (player) out.push(player);
    }
  }
  return out;
}

module.exports = {
  parseImportPlayers(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const numbered = parseNumberedImportPlayers(raw);
    if (numbered.foundNumbered) return numbered.players;
    return parseSimpleImportPlayers(raw);
  },

  focusQuickImportArea() {
    try {
      wx.pageScrollTo({ selector: '#quick-import', duration: 220 });
    } catch (_) {
      // ignore
    }
    this.setData({ focusQuickImport: true });
    setTimeout(() => this.setData({ focusQuickImport: false }), 220);
  },

  onQuickImportInput(e) {
    this.setData({ quickImportText: e.detail.value, importResultText: '', importResultDetail: '' });
  },

  async quickImportPlayers(options = {}) {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可导入', icon: 'none' });
      return;
    }
    const tournament = this.data.tournament;
    if (!tournament || tournament.status !== 'draft') {
      wx.showToast({ title: '仅草稿阶段可导入', icon: 'none' });
      return;
    }
    const players = this.parseImportPlayers(this.data.quickImportText);
    if (players.length === 0) {
      wx.showToast({ title: '请输入参赛者名字', icon: 'none' });
      return;
    }
    if (players.length > 60) {
      wx.showToast({ title: '一次最多添加 60 人', icon: 'none' });
      return;
    }

    const actionKey = `lobby:addPlayers:${this.data.tournamentId}`;
    const clientRequestId = clientRequest.resolveClientRequestId(options.clientRequestId, 'add_players');
    if (actionGuard.isBusy(actionKey)) return;
    return actionGuard.runCriticalWrite(actionKey, async () => {
      wx.showLoading({ title: '导入中...' });
      try {
        const res = cloud.assertWriteResult(await cloud.call('addPlayers', {
          tournamentId: this.data.tournamentId,
          players,
          clientRequestId
        }), '导入失败');
        wx.hideLoading();
        this.clearLastFailedAction();
        await this.fetchTournament(this.data.tournamentId);
        this.setData({ quickImportText: '' });
        nav.markRefreshFlag(this.data.tournamentId);
        const added = Number((res && (res.addedCount ?? res.added)) || 0);
        const duplicateCount = Number((res && res.duplicateCount) || 0);
        const invalidCount = Number((res && res.invalidCount) || 0);
        const maleCount = Number((res && res.maleCount) || 0);
        const femaleCount = Number((res && res.femaleCount) || 0);
        const unknownCount = Number((res && res.unknownCount) || 0);
        const parts = [];
        if (added > 0) parts.push(`新增 ${added}`);
        if (duplicateCount > 0) parts.push(`重复 ${duplicateCount}`);
        if (invalidCount > 0) parts.push(`无效 ${invalidCount}`);
        if (added > 0) parts.push(`男 ${maleCount}/女 ${femaleCount}/未设 ${unknownCount}`);
        const importResultText = parts.length ? parts.join(' · ') : '未发生变更';
        const duplicateNames = Array.isArray(res && res.duplicateNames) ? res.duplicateNames : [];
        const invalidNames = Array.isArray(res && res.invalidNames) ? res.invalidNames : [];
        const detailParts = [];
        if (duplicateNames.length) detailParts.push(`重复：${duplicateNames.slice(0, 4).join('、')}${duplicateNames.length > 4 ? '…' : ''}`);
        if (invalidNames.length) {
          const validDisplay = invalidNames.filter(Boolean);
          if (validDisplay.length) detailParts.push(`无效：${validDisplay.slice(0, 4).join('、')}${validDisplay.length > 4 ? '…' : ''}`);
        }
        this.setData({
          importResultText,
          importResultDetail: detailParts.join('；')
        });
        wx.showToast({ title: importResultText, icon: 'none' });
      } catch (err) {
        wx.hideLoading();
        this.setLastFailedAction('快速导入参赛者', () => this.quickImportPlayers({ clientRequestId }), { actionKey });
        this.handleWriteError(err, '导入失败', () => this.fetchTournament(this.data.tournamentId));
      }
    });
  }
};
