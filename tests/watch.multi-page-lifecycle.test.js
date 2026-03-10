const test = require('node:test');
const assert = require('node:assert/strict');

const watchModule = require('../miniprogram/sync/watch');

test('watchTournament keeps shared channels stable across multi-page close and reopen', async () => {
  const originalWx = global.wx;
  const originalNow = Date.now;
  const realtimeHandlers = [];
  let getCount = 0;
  let closeCount = 0;

  Date.now = () => 1710000000000;
  global.wx = {
    cloud: {
      database() {
        return {
          collection(name) {
            assert.equal(name, 'tournaments');
            return {
              doc(id) {
                assert.equal(id, 't_1');
                return {
                  async get() {
                    getCount += 1;
                    return { data: { _id: 't_1', version: getCount } };
                  },
                  watch(handlers) {
                    realtimeHandlers.push(handlers);
                    return {
                      close() {
                        closeCount += 1;
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }
    }
  };

  const pageA = [];
  const pageB = [];
  const pageC = [];
  const watcherA = watchModule.watchTournament('t_1', (doc) => pageA.push(doc.version));
  const watcherB = watchModule.watchTournament('t_1', (doc) => pageB.push(doc.version));

  try {
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(realtimeHandlers.length, 1);
    assert.deepEqual(pageA, [1]);
    assert.deepEqual(pageB, [1]);

    realtimeHandlers[0].onChange({ docs: [{ _id: 't_1', version: 2 }] });
    watcherA.close();
    realtimeHandlers[0].onChange({ docs: [{ _id: 't_1', version: 3 }] });

    assert.deepEqual(pageA, [1, 2]);
    assert.deepEqual(pageB, [1, 2, 3]);
    assert.equal(closeCount, 0);

    watcherB.close();
    assert.equal(closeCount, 1);

    const watcherC = watchModule.watchTournament('t_1', (doc) => pageC.push(doc.version));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(realtimeHandlers.length, 2);
    assert.deepEqual(pageC, [2]);

    // A stale double-close should not touch the reopened shared channel.
    watcherA.close();
    assert.equal(closeCount, 1);

    realtimeHandlers[1].onChange({ docs: [{ _id: 't_1', version: 4 }] });
    assert.deepEqual(pageC, [2, 4]);

    watcherC.close();
    assert.equal(closeCount, 2);
  } finally {
    watchModule.closeWatch('t_1');
    global.wx = originalWx;
    Date.now = originalNow;
  }
});
