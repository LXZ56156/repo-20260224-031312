const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const nav = require('../../core/nav');

module.exports = {
  parseImportPlayers(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const tokens = raw
      .split(/[\n,，;；\t ]+/)
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    const out = [];
    for (const token of tokens) {
      const matched = /^(.+?)[\/|](男|女|m|f)$/i.exec(token)
        || /^(.+?)[\(（](男|女|m|f)[\)）]$/i.exec(token)
        || /^(.+?)-(男|女|m|f)$/i.exec(token);
      if (!matched) {
        out.push({ name: token, gender: 'unknown' });
        continue;
      }
      const name = String(matched[1] || '').trim();
      const mark = String(matched[2] || '').trim().toLowerCase();
      let gender = 'unknown';
      if (mark === '男' || mark === 'm') gender = 'male';
      if (mark === '女' || mark === 'f') gender = 'female';
      out.push({ name, gender });
    }
    return out;
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
        const res = await cloud.call('addPlayers', {
          tournamentId: this.data.tournamentId,
          players,
          clientRequestId
        });
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
