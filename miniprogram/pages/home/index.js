const storage = require('../../core/storage');
const cloud = require('../../core/cloud');
const { normalizeTournament } = require('../../core/normalize');

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function formatTime(d) {
  try {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  } catch (e) {
    return '';
  }
}

function calcProgress(t) {
  const rounds = Array.isArray(t.rounds) ? t.rounds : [];
  let done = 0;
  let total = 0;
  for (const r of rounds) {
    const ms = Array.isArray(r.matches) ? r.matches : [];
    total += ms.length;
    for (const m of ms) {
      if (m && m.status === 'finished') done += 1;
    }
  }
  const M = Number(t.totalMatches) || total || 0;
  return { done, total: M || total };
}

function statusLabel(s) {
  if (s === 'running') return '进行中';
  if (s === 'draft') return '草稿';
  if (s === 'finished') return '已结束';
  if (s === 'missing') return '已移除';
  return '未知';
}

function statusClass(s) {
  if (s === 'running') return 'green';
  if (s === 'draft') return 'gray';
  if (s === 'finished') return 'red';
  return 'gray';
}

Page({
  data: {
    loading: false,
    ongoing: [],
    drafts: [],
    finished: [],
    unknown: []
  },

  onLoad() {
    // wx.cloud 已在 app.js 初始化
    const sys = wx.getSystemInfoSync();
    this._winWidth = sys.windowWidth || 375;
    this._delWidthRpx = 160; // 与 wxss 中一致
  },

  onShow() {
    this.loadRecents();
  },

  onPullDownRefresh() {
    this.loadRecents().finally(() => wx.stopPullDownRefresh());
  },

  async loadRecents() {
    this.setData({ loading: true });
    const ids = storage.getRecentTournamentIds();
    if (!ids.length) {
      this.setData({ loading: false, ongoing: [], drafts: [], finished: [], unknown: [] });
      return;
    }

    const db = wx.cloud.database();
    const _ = db.command;
    let docs = [];

    try {
      const res = await db.collection('tournaments').where({ _id: _.in(ids) }).get();
      docs = (res && res.data) || [];
    } catch (e) {
      // 数据库未初始化 / 权限问题
      wx.showToast({ title: '读取赛事记录失败', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    const map = {};
    for (const d of docs) map[d._id] = d;

    const items = ids.map(id => {
      const raw = map[id];
      if (!raw) {
        return {
          _id: id,
          name: '赛事已移除',
          status: 'missing',
          statusLabel: statusLabel('missing'),
          statusClass: statusClass('missing'),
          playersCount: 0,
          creatorId: '',
          courts: 0,
          totalMatches: 0,
          finishedMatches: 0,
          createdAtText: '',
          updatedAtText: '',
          _offset: 0
        };
      }

      const t = normalizeTournament(raw);
      const players = Array.isArray(t.players) ? t.players : [];
      const { done, total } = calcProgress(t);
      const mTotalRaw = Number(t.totalMatches) || total || 0;
      const hasConfigured = (t.status !== 'draft') ? true : (t.settingsConfigured === true);
      const matchProgressText = (hasConfigured && mTotalRaw > 0) ? `${done}/${mTotalRaw}场` : '未设置';
      const updatedAt = t.updatedAt || t.createdAt;

      const createdAtText = formatTime(t.createdAt);
      const updatedAtText = formatTime(updatedAt);

      return {
        _id: t._id,
        name: t.name || '未命名赛事',
        status: t.status || 'unknown',
        statusLabel: statusLabel(t.status),
        statusClass: statusClass(t.status),
        playersCount: players.length,
        creatorId: t.creatorId || '',
        courts: Number(t.courts) || 1,
        totalMatches: mTotalRaw,
        finishedMatches: done,
        matchProgressText,
        createdAtText,
        updatedAtText,
        _offset: 0
      };
    });

    const ongoing = [];
    const drafts = [];
    const finished = [];
    const unknown = [];
    for (const it of items) {
      if (it.status === 'running') ongoing.push(it);
      else if (it.status === 'draft') drafts.push(it);
      else if (it.status === 'finished') finished.push(it);
      else unknown.push(it);
    }

    this._closeAllSwipe();
    this.setData({ loading: false, ongoing, drafts, finished, unknown });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/create/index' });
  },

  goLobby(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/lobby/index?tournamentId=${id}` });
  },

  // ===== Swipe delete =====
  _px2rpx(px) {
    return Math.round((px * 750) / (this._winWidth || 375));
  },

  _setOffset(listKey, idx, offsetRpx) {
    const p = `${listKey}[${idx}]._offset`;
    this.setData({ [p]: offsetRpx });
  },

  _getItem(listKey, idx) {
    const list = this.data[listKey] || [];
    return list[idx];
  },

  _closeAllSwipe() {
    const keys = ['ongoing', 'drafts', 'finished', 'unknown'];
    const patch = {};
    for (const k of keys) {
      const list = this.data[k] || [];
      for (let i = 0; i < list.length; i += 1) {
        if ((list[i] && list[i]._offset) || 0) {
          patch[`${k}[${i}]._offset`] = 0;
        }
      }
    }
    if (Object.keys(patch).length) this.setData(patch);
    this._openRow = null;
    this._touch = null;
  },

  _closeOthers(openListKey, openIdx) {
    const keys = ['ongoing', 'drafts', 'finished', 'unknown'];
    const patch = {};
    for (const k of keys) {
      const list = this.data[k] || [];
      for (let i = 0; i < list.length; i += 1) {
        if (k === openListKey && i === openIdx) continue;
        if ((list[i] && list[i]._offset) || 0) {
          patch[`${k}[${i}]._offset`] = 0;
        }
      }
    }
    if (Object.keys(patch).length) this.setData(patch);
  },

  onTouchStart(e) {
    const { list, idx, id } = e.currentTarget.dataset;
    if (list === undefined || idx === undefined) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;

    this._closeOthers(list, Number(idx));

    const item = this._getItem(list, Number(idx)) || {};
    this._touch = {
      id,
      listKey: list,
      idx: Number(idx),
      startX: touch.clientX,
      startY: touch.clientY,
      startOffset: Number(item._offset) || 0,
      locked: false
    };
  },

  onTouchMove(e) {
    if (!this._touch) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - this._touch.startX;
    const dy = touch.clientY - this._touch.startY;
    if (!this._touch.locked) {
      // 方向锁：明显横向才处理
      if (Math.abs(dx) < 6) return;
      if (Math.abs(dx) <= Math.abs(dy) + 6) {
        // 认为是纵向滚动
        this._touch = null;
        return;
      }
      this._touch.locked = true;
    }

    const dxRpx = this._px2rpx(dx);
    const del = -this._delWidthRpx;
    let next = this._touch.startOffset + dxRpx;
    if (next < del) next = del;
    if (next > 0) next = 0;

    this._setOffset(this._touch.listKey, this._touch.idx, next);
  },

  onTouchEnd() {
    if (!this._touch) return;
    const { listKey, idx } = this._touch;
    const item = this._getItem(listKey, idx) || {};
    const cur = Number(item._offset) || 0;
    const del = -this._delWidthRpx;
    const shouldOpen = Math.abs(cur) > (this._delWidthRpx / 2);
    const next = shouldOpen ? del : 0;
    this._setOffset(listKey, idx, next);
    this._openRow = shouldOpen ? { listKey, idx } : null;
    this._touch = null;
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    // 如果当前有展开的删除按钮，优先收起，避免误触进入
    if (this._openRow) {
      const { listKey, idx } = this._openRow;
      const item = this._getItem(listKey, idx) || {};
      if (item._id === id && (Number(item._offset) || 0) !== 0) {
        this._setOffset(listKey, idx, 0);
        this._openRow = null;
        return;
      }
    }

    wx.navigateTo({ url: `/pages/lobby/index?tournamentId=${id}` });
  },

  async onDeleteTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    // 取到 item，决定是否展示“删除云端”
    const openid = (getApp().globalData.openid || storage.get('openid', ''));
    const findIn = (key) => (this.data[key] || []).find(x => x && x._id === id);
    const item = findIn('ongoing') || findIn('drafts') || findIn('finished') || findIn('unknown') || {};
    const isCreator = !!(item.creatorId && openid && item.creatorId === openid);
    const canDeleteCloud = isCreator && item.status !== 'missing';

    const itemList = canDeleteCloud ? ['仅删除本机记录', '删除云端赛事'] : ['仅删除本机记录'];
    wx.showActionSheet({
      itemList,
      success: async (res) => {
        const tapIndex = res.tapIndex;
        if (tapIndex === 0) {
          storage.removeRecentTournamentId(id);
          this.loadRecents();
          return;
        }
        if (tapIndex === 1 && canDeleteCloud) {
          wx.showModal({
            title: '删除云端赛事？',
            content: '该操作不可恢复。删除后，群内分享链接将失效。',
            confirmText: '删除',
            confirmColor: '#ef4444',
            success: async (r) => {
              if (!r.confirm) return;
              wx.showLoading({ title: '删除中...' });
              try {
                await cloud.call('deleteTournament', { tournamentId: id });
                wx.hideLoading();
                storage.removeRecentTournamentId(id);
                await this.loadRecents();
                wx.showToast({ title: '已删除', icon: 'success' });
              } catch (err) {
                wx.hideLoading();
                wx.showToast({ title: '删除失败', icon: 'none' });
              }
            }
          });
        }
      }
    });
  }
});
