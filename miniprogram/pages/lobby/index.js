const cloud = require('../../core/cloud');
const watchUtil = require('../../sync/watch');
const storage = require('../../core/storage');
const perm = require('../../permission/permission');
const normalize = require('../../core/normalize');

Page({
  data: {
    tournamentId: '',
    tournament: null,
    statusText: '',
    statusClass: 'tag-draft',

    // 鍔犲叆锛堟湭鍙傝禌锛?    nickname: '',
    joinAvatar: '',
    joinAvatarDisplay: '/assets/avatar-default.png',
    focusJoinNick: false,

    // 宸插弬璧涚敤鎴疯嚜宸辩殑淇℃伅锛堣崏绋块樁娈靛彲鏀癸級
    showMyProfile: false,
    myNickname: '',
    myAvatar: '',
    myAvatarDisplay: '/assets/avatar-default.png',
    focusMyNick: false,
    myJoined: false,

    isAdmin: false,
    isReferee: false,
    refereeId: '',
    refereeName: '鏈缃?',

    showJoin: false,
    showAllPlayers: false,
    playersPreview: [],
    displayPlayers: [],

    createdAtText: '',
    // KPI锛氬湪鈥滄湭瀹屾垚璁剧疆鈥濆墠涓嶆樉绀洪粯璁ゆ暟瀛楋紝閬垮厤璇
    kpiReady: false,
    kpiPlayers: '鈥?',
    kpiMatches: '鈥?',
    kpiCourts: '鈥?',
    matchInfoText: '鏈缃?',

    // 绠＄悊鍛樺紑璧涘墠妫€鏌?    checkPlayersOk: false,
    checkSettingsOk: false
  },

  onLoad(options) {
    let tid = options.tournamentId;
    if ((!tid) && options && options.scene) {
      const scene = decodeURIComponent(options.scene);
      const m = /tournamentId=([^&]+)/.exec(scene) || /tid=([^&]+)/.exec(scene);
      if (m) tid = m[1];
    }
    this.setData({ tournamentId: tid });

    this.openid = (getApp().globalData.openid || storage.get('openid', ''));

    // 澶村儚涓存椂 URL 缂撳瓨锛坈loud fileID -> temp URL锛?    this.avatarCache = {};

    // 鑻ユ湰鏈哄凡鏈夋巿鏉冪紦瀛橈紝浼樺厛棰勫～鏄电О/澶村儚
    const up = storage.getUserProfile();
    if (up && typeof up === 'object') {
      let nick = String(up.nickName || up.nickname || '').trim();
      if (nick === '寰俊鐢ㄦ埛') nick = '';
      const avatar = String(up.avatarUrl || up.avatar || '').trim();
      if (nick) {
        this.setData({ nickname: nick, myNickname: nick });
      }
      if (avatar) {
        this.setData({ joinAvatar: avatar, myAvatar: avatar });
        this.setJoinAvatarDisplay(avatar);
        this.setMyAvatarDisplay(avatar);
      }
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = null;
  },

  onUnload() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = null;
  },

  onShow() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  startWatch(tid) {
    if (!tid) return;
    if (this.watcher && this.watcher.close) this.watcher.close();
    this.watcher = watchUtil.watchTournament(tid, (doc) => {
      this.setTournament(doc);
    });
  },
  async fetchTournament(tid) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('tournaments').doc(tid).get();
      this.setTournament(res.data);
    } catch (e) {
      console.error('fetchTournament failed', e);
    }
  },

  setTournament(t) {
    if (!t) return;
    t = normalize.normalizeTournament(t);

    const status = t.status || 'draft';
    let statusText = '鑽夌';
    let statusClass = 'tag-draft';
    if (status === 'running') { statusText = '杩涜涓?'; statusClass = 'tag-running'; }
    if (status === 'finished') { statusText = '宸茬粨鏉?'; statusClass = 'tag-finished'; }

    const openid = this.openid || (getApp().globalData.openid || storage.get('openid', ''));
    const isAdmin = perm.isAdmin(t, openid);

    const players = Array.isArray(t.players) ? t.players : [];
    const playersCount = players.length;
    const myPlayer = openid ? players.find(p => p && p.id === openid) : null;
    const myJoined = !!myPlayer;

    // 瑁佸垽灞曠ず
    let refereeName = '鏈缃?';
    let isReferee = false;
    const refereeId = String(t.refereeId || '').trim();
    if (refereeId) {
      const ref = players.find(p => p && p.id === refereeId);
      refereeName = (ref && ref.name) ? ref.name : '宸茶缃?';
      isReferee = !!(openid && refereeId === openid);
    }

    const showJoin = (status === 'draft') && !myJoined;
    const showMyProfile = (status === 'draft') && myJoined;

    const showAllPlayers = !!this.data.showAllPlayers;
    const displayPlayers = this.buildDisplayPlayers(showAllPlayers ? players : players.slice(0, 12));

    const createdAtText = (() => {
      try {
        const d = t.createdAt ? new Date(t.createdAt) : null;
        if (!d || Number.isNaN(d.getTime())) return '';
        const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      } catch (e) {
        return '';
      }
    })();

    const totalMatches = Number(t.totalMatches) || 0;
    const courts = Number(t.courts) || 0;

    let kpiReady;
    if (status !== 'draft') {
      kpiReady = true;
    } else if (t.settingsConfigured === true) {
      kpiReady = true;
    } else if (t.settingsConfigured === false) {
      kpiReady = false;
    } else {
      kpiReady = playersCount >= 4 && totalMatches >= 1 && courts >= 1;
    }

    const checkPlayersOk = playersCount >= 4;
    const checkSettingsOk = !!t.settingsConfigured;

    this.setData({
      tournament: t,
      statusText,
      statusClass,
      isAdmin,
      isReferee,
      refereeId,
      refereeName,

      showJoin,
      showMyProfile,
      myJoined,

      displayPlayers,
      createdAtText,

      kpiReady,
      kpiPlayers: kpiReady ? String(playersCount) : '鈥?',
      kpiMatches: kpiReady ? String(totalMatches) : '鈥?',
      kpiCourts: kpiReady ? String(courts) : '鈥?',
      matchInfoText: kpiReady ? `总 ${totalMatches} 场 · 每轮最多 ${courts} 场` : '未设置',

      checkPlayersOk,
      checkSettingsOk,
      startDisabled: !(checkPlayersOk && checkSettingsOk)
    });

    // 鍚屾鎴戠殑鏄电О/澶村儚鏄剧ず锛堜粎鍦ㄦ湭鎵嬪姩缂栬緫鏃惰窡闅忎簯绔級
    if (showMyProfile && myPlayer) {
      const name = String(myPlayer.name || '').trim();
      const avatar = String(myPlayer.avatar || myPlayer.avatarUrl || '').trim();
      if (!this._myEditedNick) this.setData({ myNickname: name || this.data.myNickname });
      if (!this._myEditedAvatar) {
        this.setData({ myAvatar: avatar || this.data.myAvatar });
        this.setMyAvatarDisplay(avatar);
      }
    }

    // 寮傛瑙ｆ瀽 cloud fileID 澶村儚涓轰复鏃?URL锛堢敤浜庡弬璧涘悕鍗曞睍绀猴級
    this.resolveDisplayPlayersAvatars();

    // 鏈€杩戣闂褰?    storage.addRecentTournamentId(t._id);
  },

  // 灞曞紑/鏀惰捣鍙傝禌鍚嶅崟
  togglePlayers() {
    const next = !this.data.showAllPlayers;
    const t = this.data.tournament;
    const players = t && Array.isArray(t.players) ? t.players : [];
    this.setData({ showAllPlayers: next, displayPlayers: this.buildDisplayPlayers(next ? players : players.slice(0, 12)) }, () => {
      this.resolveDisplayPlayersAvatars();
    });
  },

  // 鍚嶅崟灞曠ず锛氱敓鎴愰瀛楁瘝/鍗犱綅鑹?+ 澶村儚锛堣嫢鏈夛級
  buildDisplayPlayers(list) {
    const players = Array.isArray(list) ? list : [];
    return players.map(p => {
      const id = String((p && (p.id || p._id)) || '').trim();
      const name = String((p && p.name) || '').trim();
      const raw = String((p && (p.avatar || p.avatarUrl)) || '').trim();
      const initial = this.getInitial(name);
      const colorClass = `pcolor-${this.hashString(name || id) % 6}`;

      let avatarDisplay = '';
      if (raw) {
        if (raw.startsWith('cloud://')) {
          avatarDisplay = (this.avatarCache && this.avatarCache[raw]) || '';
        } else {
          avatarDisplay = raw;
        }
      }
      return { id: id || name, name: name || '鐞冨憳', avatarRaw: raw, avatarDisplay, initial, colorClass };
    });
  },

  getInitial(name) {
    const s = String(name || '').trim();
    if (!s) return '?';
    // 鍙栭涓潪绌哄瓧绗︼紙涓枃/鑻辨枃鍧囧彲锛?    return s.slice(0, 1).toUpperCase();
  },

  hashString(s) {
    const str = String(s || '');
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  },

  onTapPlayerName(e) {
    const name = String(e.currentTarget.dataset.name || '').trim();
    if (!name) return;
    wx.showModal({ title: '鍙傝禌鑰?', content: name, showCancel: false });
  },

  onNick(e) {
    this.setData({ nickname: e.detail.value });
  },

  onMyNick(e) {
    this._myEditedNick = true;
    this.setData({ myNickname: e.detail.value });
  },

  // 寰俊宸查€愭鍥炴敹閫氳繃鎺ュ彛鐩存帴鑾峰彇鐪熷疄鏄电О/澶村儚鐨勮兘鍔涳紱
  // 杩欓噷鐢ㄢ€滄樀绉板～鍐欒兘鍔涒€?input type="nickname") + chooseAvatar 璁╃敤鎴蜂富鍔ㄩ€夋嫨銆?
  focusJoinNickInput() {
    this.setData({ focusJoinNick: true });
    wx.showToast({ title: '鐐规樀绉拌緭鍏ユ锛岄敭鐩樹笂鏂瑰彲涓€閿～鍏ュ井淇℃樀绉?', icon: 'none' });
    setTimeout(() => this.setData({ focusJoinNick: false }), 200);
  },

  focusMyNickInput() {
    this.setData({ focusMyNick: true });
    wx.showToast({ title: '鐐规樀绉拌緭鍏ユ锛岄敭鐩樹笂鏂瑰彲涓€閿～鍏ュ井淇℃樀绉?', icon: 'none' });
    setTimeout(() => this.setData({ focusMyNick: false }), 200);
  },

  async onChooseAvatarForJoin(e) {
    try {
      const tempPath = e && e.detail && e.detail.avatarUrl;
      if (!tempPath) return;
      const openid = (getApp().globalData.openid || storage.get('openid', ''));
      wx.showLoading({ title: '涓婁紶澶村儚...' });
      const up = await wx.cloud.uploadFile({
        cloudPath: `avatars/${openid || 'user'}_${Date.now()}.png`,
        filePath: tempPath
      });
      wx.hideLoading();
      const fileID = up && up.fileID;
      if (fileID) {
        this.setData({ joinAvatar: fileID });
        await this.setJoinAvatarDisplay(fileID);
        const old = storage.getUserProfile() || {};
        storage.setUserProfile({ ...old, avatar: fileID });
      }
    } catch (e2) {
      wx.hideLoading();
      wx.showToast({ title: '澶村儚涓婁紶澶辫触', icon: 'none' });
    }
  },

  async onChooseAvatarForMe(e) {
    try {
      const tempPath = e && e.detail && e.detail.avatarUrl;
      if (!tempPath) return;
      const openid = (getApp().globalData.openid || storage.get('openid', ''));
      wx.showLoading({ title: '涓婁紶澶村儚...' });
      const up = await wx.cloud.uploadFile({
        cloudPath: `avatars/${openid || 'user'}_${Date.now()}.png`,
        filePath: tempPath
      });
      wx.hideLoading();
      const fileID = up && up.fileID;
      if (fileID) {
        this._myEditedAvatar = true;
        this.setData({ myAvatar: fileID });
        await this.setMyAvatarDisplay(fileID);
        const old = storage.getUserProfile() || {};
        storage.setUserProfile({ ...old, avatar: fileID });
      }
    } catch (e2) {
      wx.hideLoading();
      wx.showToast({ title: '澶村儚涓婁紶澶辫触', icon: 'none' });
    }
  },

  async setJoinAvatarDisplay(avatar) {
    const url = await this.resolveAvatarDisplay(avatar);
    this.setData({ joinAvatarDisplay: url });
  },

  async setMyAvatarDisplay(avatar) {
    const url = await this.resolveAvatarDisplay(avatar);
    this.setData({ myAvatarDisplay: url });
  },

  async resolveAvatarDisplay(avatar) {
    const fallback = '/assets/avatar-default.png';
    const a = String(avatar || '').trim();
    if (!a) return fallback;
    if (a.startsWith('cloud://')) {
      if (this.avatarCache && this.avatarCache[a]) return this.avatarCache[a];
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [a] });
        const url = res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL;
        if (url) {
          this.avatarCache[a] = url;
          return url;
        }
        return fallback;
      } catch (_) {
        return fallback;
      }
    }
    return a;
  },

  async resolveDisplayPlayersAvatars() {
    try {
      const list = Array.isArray(this.data.displayPlayers) ? this.data.displayPlayers.slice() : [];
      if (!list.length) return;
      const need = [];
      const mapIdx = {};
      for (let i = 0; i < list.length; i++) {
        const p = list[i] || {};
        const raw = String(p.avatarRaw || '').trim();
        if (!raw) {
          list[i].avatarDisplay = '';
          continue;
        }
        if (raw.startsWith('cloud://')) {
          if (this.avatarCache && this.avatarCache[raw]) {
            list[i].avatarDisplay = this.avatarCache[raw];
          } else {
            list[i].avatarDisplay = '';
            need.push(raw);
            mapIdx[raw] = mapIdx[raw] || [];
            mapIdx[raw].push(i);
          }
        } else {
          list[i].avatarDisplay = raw;
        }
      }

      this.setData({ displayPlayers: list });

      if (!need.length) return;
      const res = await wx.cloud.getTempFileURL({ fileList: need });
      const fl = (res && res.fileList) || [];
      for (const it of fl) {
        const fileID = it && it.fileID;
        const url = it && it.tempFileURL;
        if (!fileID || !url) continue;
        this.avatarCache[fileID] = url;
        const idxs = mapIdx[fileID] || [];
        for (const idx of idxs) {
          if (list[idx]) list[idx].avatarDisplay = url;
        }
      }
      this.setData({ displayPlayers: list });
    } catch (e) {
      // ignore
    }
  },

  async handleJoin() {
    const tid = this.data.tournamentId;
    let nickname = String((this.data.nickname || '')).trim();
    let avatar = String((this.data.joinAvatar || '')).trim();

    if (!nickname || !avatar) {
      const up = storage.getUserProfile();
      if (up && typeof up === 'object') {
        if (!nickname) nickname = String(up.nickName || up.nickname || '').trim() || nickname;
        if (!avatar) avatar = String(up.avatarUrl || up.avatar || '').trim() || avatar;
      }
    }

    // 鏄电О/澶村儚鍙浠讳竴瀛楁鏈夊€煎氨鏇存柊鏈湴缂撳瓨
    if (nickname || avatar) {
      const old = storage.getUserProfile() || {};
      storage.setUserProfile({ ...old, nickname, avatar });
    }

    wx.showLoading({ title: '鍔犲叆涓?..' });
    try {
      const res = await cloud.call('joinTournament', {
        tournamentId: tid,
        nickname,
        avatar
      });
      if (res && res.ok === false) {
        throw new Error(String(res.message || '鍔犲叆澶辫触'));
      }
      wx.hideLoading();
      wx.showToast({ title: '宸插姞鍏?', icon: 'success' });
      // 绔嬪嵆鍒锋柊涓€娆★紝閬垮厤鐪熸満鐩戝惉涓嶈Е鍙戝鑷村悕鍗曚笉鏇存柊
      this.fetchTournament(tid);
    } catch (e) {
      wx.hideLoading();
      const msg = String((e && (e.message || e.errMsg)) || '鍔犲叆澶辫触');
      wx.showToast({ title: msg.replace(/^cloud\.call:fail\s*/i, ''), icon: 'none' });
    }
  },

  async saveMyProfile() {
    const t = this.data.tournament;
    if (!t || t.status !== 'draft') {
      wx.showToast({ title: '闈炶崏绋块樁娈典笉鍙慨鏀?', icon: 'none' });
      return;
    }
    const nickname = String(this.data.myNickname || '').trim();
    const avatar = String(this.data.myAvatar || '').trim();
    if (!nickname && !avatar) {
      wx.showToast({ title: '鏄电О/澶村儚鑷冲皯濉竴涓?', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '淇濆瓨涓?..' });
    try {
      const res = await cloud.call('joinTournament', {
        tournamentId: this.data.tournamentId,
        nickname,
        avatar
      });
      if (res && res.ok === false) {
        throw new Error(String(res.message || '淇濆瓨澶辫触'));
      }
      wx.hideLoading();
      wx.showToast({ title: '宸叉洿鏂?', icon: 'success' });

      // 鍚屾鏈満缂撳瓨锛堝彲閫夛級
      const old = storage.getUserProfile() || {};
      storage.setUserProfile({ ...old, nickName: nickname || old.nickName || '', avatarUrl: old.avatarUrl || '', avatar: avatar || old.avatar || '' });

      this.fetchTournament(this.data.tournamentId);
    } catch (e) {
      wx.hideLoading();
      const msg = String((e && (e.message || e.errMsg)) || '淇濆瓨澶辫触');
      wx.showToast({ title: msg.replace(/^cloud\.call:fail\s*/i, ''), icon: 'none' });
    }
  },

  goSchedule() {
    wx.navigateTo({ url: `/pages/schedule/index?tournamentId=${this.data.tournamentId}` });
  },

  goRanking() {
    wx.navigateTo({ url: `/pages/ranking/index?tournamentId=${this.data.tournamentId}` });
  },

  goSettings() {
    wx.navigateTo({ url: `/pages/settings/index?tournamentId=${this.data.tournamentId}` });
  },

  async handleStart() {
    const t = this.data.tournament;
    if (!t) return;
    if (!this.data.isAdmin) return;
    if (t.status !== 'draft') {
      wx.showToast({ title: '璧涗簨宸插紑濮?', icon: 'none' });
      return;
    }
    if (!this.data.checkPlayersOk) {
      wx.showToast({ title: '鑷冲皯闇€瑕?4 鍚嶅弬璧涜€?', icon: 'none' });
      return;
    }
    if (!this.data.checkSettingsOk) {
      wx.showToast({ title: '璇峰厛鍦ㄢ€滆禌浜嬭缃€濅繚瀛樻瘮璧涘弬鏁?', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '鐢熸垚璧涚▼...' });
    try {
      await cloud.call('startTournament', {
        tournamentId: this.data.tournamentId
      });
      wx.hideLoading();
      wx.showToast({ title: '宸插紑璧?', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      const msg = String((e && (e.message || e.errMsg)) || '寮€璧涘け璐?');
      wx.showToast({ title: msg.replace(/^cloud\.call:fail\s*/i, ''), icon: 'none' });
    }
  },

  async handleReset() {
    wx.showModal({
      title: '纭閲嶇疆锛?',
      content: '灏嗘竻绌鸿禌绋嬩笌姣斿垎锛屽洖鍒拌崏绋跨姸鎬併€?',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '閲嶇疆涓?..' });
        try {
          await cloud.call('resetTournament', { tournamentId: this.data.tournamentId });
          wx.hideLoading();
          wx.showToast({ title: '宸查噸缃?', icon: 'success' });
        } catch (e) {
          wx.hideLoading();
          const msg = String((e && (e.message || e.errMsg)) || '閲嶇疆澶辫触');
          wx.showToast({ title: msg.replace(/^cloud\.call:fail\s*/i, ''), icon: 'none' });
        }
      }
    });
  },

  onShareAppMessage() {
    const tid = this.data.tournamentId;
    const name = (this.data.tournament && this.data.tournament.name) ? this.data.tournament.name : '缇芥瘺鐞冭疆杞禌';
    return {
      title: `${name}｜观赛入口`,
      path: `/pages/lobby/index?tournamentId=${tid}`
    };
  }
});



