const recovery = require('../../core/tournamentRecovery');
const cloud = require('../../core/cloud');
const nav = require('../../core/nav');

Page({
  data: { items: [], loading: false, loaded: false, hasMore: false, error: '' },

  onLoad() { this.loadList(true); },
  onShow() {
    if (this._hasShown) this.loadList(true);
    this._hasShown = true;
  },
  onHide() { this._requestSeq = Number(this._requestSeq || 0) + 1; this._loading = false; },
  onUnload() { this._requestSeq = Number(this._requestSeq || 0) + 1; this._loading = false; },
  onPullDownRefresh() { return this.loadList(true); },
  onReachBottom() { if (this.data.hasMore && !this.data.error) this.loadList(false); },
  loadMore() { return this.loadList(false); },
  retry() { return this.loadList(this._lastLoadReset === true); },

  async loadList(reset = false) {
    if (this._loading && !reset) return;
    if (!reset && this.data.loaded && !this.data.hasMore) return;
    const sequence = Number(this._requestSeq || 0) + 1;
    this._requestSeq = sequence;
    this._loading = true;
    const cursor = reset ? '' : String(this._cursor || '');
    this._lastLoadReset = reset;
    this.setData({ loading: true, error: '' });
    try {
      const page = await recovery.getPage(cursor);
      if (sequence !== this._requestSeq) return;
      const items = reset ? [] : this.data.items.slice();
      const seen = new Set(items.map((item) => item.id));
      page.items.forEach((item) => { if (!seen.has(item.id)) { items.push(item); seen.add(item.id); } });
      this._cursor = page.cursor;
      this.setData({ items, loaded: true, hasMore: page.hasMore, error: '' });
    } catch (err) {
      if (sequence !== this._requestSeq) return;
      this.setData({ error: cloud.getUserFacingErrorMessage(err, '比赛加载失败，请重试') });
    } finally {
      if (sequence === this._requestSeq) {
        this._loading = false;
        this.setData({ loading: false });
        if (typeof wx !== 'undefined' && typeof wx.stopPullDownRefresh === 'function') wx.stopPullDownRefresh();
      }
    }
  },

  openTournament(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || '');
    if (!id || !this.data.items.some((item) => item.id === id)) return;
    wx.navigateTo({ url: nav.buildTournamentUrl('/pages/share-entry/index', id) });
  }
});
