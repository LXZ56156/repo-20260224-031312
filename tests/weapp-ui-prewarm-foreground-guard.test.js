const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('prewarm without an exact foreground opt-in never starts a process or automator', async () => {
  const modulePath = require.resolve('../scripts/dev/weapp-ui-prewarm');
  const originalLoad = Module._load;
  const previous = process.env.WEAPP_ALLOW_FOREGROUND_PREWARM;
  const calls = [];
  delete require.cache[modulePath];
  Module._load = function patched(request, parent, isMain) {
    if (parent && parent.filename === modulePath) {
      if (request === 'child_process') return { spawn() { calls.push('spawn'); throw new Error('unexpected spawn'); } };
      if (request === './weapp-ui-screenshot') return {
        resolveAutomator() { calls.push('automator'); throw new Error('unexpected automator'); }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { main } = require(modulePath);
    for (const value of [undefined, '0', 'true', ' 1']) {
      if (value === undefined) delete process.env.WEAPP_ALLOW_FOREGROUND_PREWARM;
      else process.env.WEAPP_ALLOW_FOREGROUND_PREWARM = value;
      await assert.rejects(main(), /日常截图只连接已签名热会话/);
    }
    assert.deepEqual(calls, []);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
    if (previous === undefined) delete process.env.WEAPP_ALLOW_FOREGROUND_PREWARM;
    else process.env.WEAPP_ALLOW_FOREGROUND_PREWARM = previous;
  }
});
