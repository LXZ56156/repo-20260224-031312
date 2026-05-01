const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');
const nav = require('../miniprogram/core/nav');
const importActions = require('../miniprogram/pages/lobby/lobbyImportActions');
const { createContext } = require('./timeout-reentry.helpers');

const fridayRelaySample = `周五晚上8点跟帖
1啊源
2喜洋洋🌺
3小温🌺
4啊源1（教练）
5霖🌺
6霖+1
7冯珂欣🌺
8
9
10`;

const groupedRelaySample = `🏸新飒羽毛球馆俱乐部
  八人转对抗福利小活动
时间：周日晚8点-11点
费用：球费场地AA 🌺-5
用球： F7
奖品丰富（由翎美羽毛球赞助及群主赞助
第一名 102C 
第二名 运动毛巾
第三名-第五名 运动袜子
第六名-第八名 运动补水1支

男双（根据实际水平设让分）
1黎梓轩（让1分）
2啊源 （我让3分
3坤哥
4Y 
5黄科
6羽强
7天天8点15分到
8云
女双🌸
1春梅🌺
2QQ
3李婷
4潘潘
5Selina
6贤
7杨杨
8梧玖
截止`;

test('parseImportPlayers handles numbered relay with flowers and empty slots', () => {
  assert.deepEqual(importActions.parseImportPlayers(fridayRelaySample), [
    { name: '啊源', gender: 'unknown' },
    { name: '喜洋洋', gender: 'female' },
    { name: '小温', gender: 'female' },
    { name: '啊源1', gender: 'unknown' },
    { name: '霖', gender: 'female' },
    { name: '霖+1', gender: 'unknown' },
    { name: '冯珂欣', gender: 'female' }
  ]);
});

test('parseImportPlayers handles grouped relay and strips event copy', () => {
  const parsed = importActions.parseImportPlayers(groupedRelaySample);

  assert.deepEqual(parsed.map((item) => item.name), [
    '黎梓轩',
    '啊源',
    '坤哥',
    'Y',
    '黄科',
    '羽强',
    '天天',
    '云',
    '春梅',
    'QQ',
    '李婷',
    '潘潘',
    'Selina',
    '贤',
    '杨杨',
    '梧玖'
  ]);
  assert.deepEqual(parsed.map((item) => item.gender), [
    'male',
    'male',
    'male',
    'male',
    'male',
    'male',
    'male',
    'male',
    'female',
    'female',
    'female',
    'female',
    'female',
    'female',
    'female',
    'female'
  ]);
});

test('parseImportPlayers keeps simple list compatibility and explicit gender priority', () => {
  assert.deepEqual(importActions.parseImportPlayers('张三/男 李四(女),王五-男 赵六'), [
    { name: '张三', gender: 'male' },
    { name: '李四', gender: 'female' },
    { name: '王五', gender: 'male' },
    { name: '赵六', gender: 'unknown' }
  ]);

  assert.deepEqual(importActions.parseImportPlayers('男双\n1小花/女\n2阿强🌺/男\n女双\n1阿丽-男'), [
    { name: '小花', gender: 'female' },
    { name: '阿强', gender: 'male' },
    { name: '阿丽', gender: 'male' }
  ]);
});

test('parseImportPlayers supports numbering variants and inline relay entries', () => {
  assert.deepEqual(importActions.parseImportPlayers('1. 张三 2、李四\n①王五②赵六\n5\n6. \n7天天8点15分到'), [
    { name: '张三', gender: 'unknown' },
    { name: '李四', gender: 'unknown' },
    { name: '王五', gender: 'unknown' },
    { name: '赵六', gender: 'unknown' },
    { name: '天天', gender: 'unknown' }
  ]);
});

test('parseImportPlayers supports common bracketed and keycap relay numbers', () => {
  assert.deepEqual(importActions.parseImportPlayers('（1）张三\n(2) 李四\n【3】王五\n[4]赵六\n1️⃣小陈\n2⃣阿明\n🔟阿十'), [
    { name: '张三', gender: 'unknown' },
    { name: '李四', gender: 'unknown' },
    { name: '王五', gender: 'unknown' },
    { name: '赵六', gender: 'unknown' },
    { name: '小陈', gender: 'unknown' },
    { name: '阿明', gender: 'unknown' },
    { name: '阿十', gender: 'unknown' }
  ]);
});

test('parseImportPlayers handles colon group headers on the same line', () => {
  assert.deepEqual(importActions.parseImportPlayers('男：1张三 2李四\n女生：1小美 2小丽'), [
    { name: '张三', gender: 'male' },
    { name: '李四', gender: 'male' },
    { name: '小美', gender: 'female' },
    { name: '小丽', gender: 'female' }
  ]);
});

test('parseImportPlayers reads common inline gender suffixes and strips status notes', () => {
  assert.deepEqual(importActions.parseImportPlayers('1张三 男 ✅\n2李四 女 已付款\n3王五♂\n4赵六♀\n5小陈（男，已付）\n6阿明（女 代付）\n7小吴/女（已付）'), [
    { name: '张三', gender: 'male' },
    { name: '李四', gender: 'female' },
    { name: '王五', gender: 'male' },
    { name: '赵六', gender: 'female' },
    { name: '小陈', gender: 'male' },
    { name: '阿明', gender: 'female' },
    { name: '小吴', gender: 'female' }
  ]);
});

test('parseImportPlayers handles common unnumbered name lists', () => {
  assert.deepEqual(importActions.parseImportPlayers('张三、李四、王五'), [
    { name: '张三', gender: 'unknown' },
    { name: '李四', gender: 'unknown' },
    { name: '王五', gender: 'unknown' }
  ]);

  assert.deepEqual(importActions.parseImportPlayers('张三 男 李四 女 王五♂ 赵六♀ 小陈/男（已付） 阿明-女✅'), [
    { name: '张三', gender: 'male' },
    { name: '李四', gender: 'female' },
    { name: '王五', gender: 'male' },
    { name: '赵六', gender: 'female' },
    { name: '小陈', gender: 'male' },
    { name: '阿明', gender: 'female' }
  ]);
});

test('parseImportPlayers ignores event info numbers when relay has player numbers', () => {
  assert.deepEqual(importActions.parseImportPlayers('8人转活动\n限制：16人\n费用：40/人\n日期：5月1日\n奖品：1等奖\n男：1张三 2李四'), [
    { name: '张三', gender: 'male' },
    { name: '李四', gender: 'male' }
  ]);

  assert.deepEqual(importActions.parseImportPlayers('费用：40/人\n限制：16 人\n日期：5 月 1 日'), []);
});

test('parseImportPlayers handles spaced plus-one and ten keycap relay marker', () => {
  assert.deepEqual(importActions.parseImportPlayers('1霖 +1\n2小温 🌺\n10️⃣阿十\n11十一'), [
    { name: '霖+1', gender: 'unknown' },
    { name: '小温', gender: 'female' },
    { name: '阿十', gender: 'unknown' },
    { name: '十一', gender: 'unknown' }
  ]);
});

test('quickImportPlayers sends parsed relay players to addPlayers', async () => {
  const originalWx = global.wx;
  const originalCall = cloud.call;
  const originalMarkRefreshFlag = nav.markRefreshFlag;
  const calls = [];
  let fetchCalled = false;

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast() {}
  };

  try {
    cloud.call = async (name, payload) => {
      calls.push({ name, payload });
      return {
        ok: true,
        addedCount: payload.players.length,
        duplicateCount: 0,
        invalidCount: 0,
        maleCount: payload.players.filter((item) => item.gender === 'male').length,
        femaleCount: payload.players.filter((item) => item.gender === 'female').length,
        unknownCount: payload.players.filter((item) => item.gender === 'unknown').length
      };
    };
    nav.markRefreshFlag = () => {};

    const ctx = createContext(importActions, {
      tournamentId: 't_import',
      isAdmin: true,
      tournament: { status: 'draft' },
      quickImportText: groupedRelaySample
    });
    ctx.fetchTournament = async () => {
      fetchCalled = true;
    };
    ctx.clearLastFailedAction = () => {};
    ctx.setLastFailedAction = () => {};
    ctx.handleWriteError = (err) => {
      throw err;
    };

    await ctx.quickImportPlayers();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'addPlayers');
    assert.deepEqual(calls[0].payload.players.map((item) => item.name), [
      '黎梓轩',
      '啊源',
      '坤哥',
      'Y',
      '黄科',
      '羽强',
      '天天',
      '云',
      '春梅',
      'QQ',
      '李婷',
      '潘潘',
      'Selina',
      '贤',
      '杨杨',
      '梧玖'
    ]);
    assert.equal(calls[0].payload.players.filter((item) => item.gender === 'male').length, 8);
    assert.equal(calls[0].payload.players.filter((item) => item.gender === 'female').length, 8);
    assert.equal(fetchCalled, true);
    assert.equal(ctx.data.quickImportText, '');
  } finally {
    actionGuard.clear('lobby:addPlayers:t_import');
    global.wx = originalWx;
    cloud.call = originalCall;
    nav.markRefreshFlag = originalMarkRefreshFlag;
  }
});
