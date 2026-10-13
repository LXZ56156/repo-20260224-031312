const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bundleRoot = path.resolve(__dirname, '../miniprogram/miniprogram_npm/@vant/weapp');

// Execute the registered popup/transition behavior, with only the frame clock and
// WeChat registration/rendering APIs controlled. This is not native UI evidence.
function createHarness() {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const context = vm.createContext({
    Behavior: definition => definition,
    setTimeout: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
  });
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const requireLocal = name => {
      if (name === '../common/component') {
        return { VantComponent: definition => { module.exports.definition = definition; } };
      }
      if (name === '../common/utils') {
        return { requestAnimationFrame: callback => context.setTimeout(callback, 1000 / 30) };
      }
      if (name === '../common/validator') return { isObj: value => value !== null && typeof value === 'object' };
      return load(path.resolve(path.dirname(file), `${name}.js`));
    };
    context.module = module;
    context.require = requireLocal;
    vm.runInContext(`(function (module, exports, require) {\n${fs.readFileSync(file, 'utf8')}\n})(module, module.exports, require);`, context);
    cache.set(file, module.exports);
    return module.exports;
  }
  function component(kind) {
    const definition = load(path.join(bundleRoot, kind, 'index.js')).definition;
    const behavior = definition.mixins[0];
    const data = { ...behavior.data };
    for (const [name, property] of Object.entries(behavior.properties)) {
      data[name] = property && typeof property === 'object' ? property.value : undefined;
    }
    for (const [name, property] of Object.entries(definition.props || {})) {
      data[name] = property && typeof property === 'object' ? property.value : undefined;
    }
    data.show = false;
    if (kind === 'popup') data.position = 'bottom';
    const instance = {
      data,
      events: [],
      setData: values => Object.assign(data, values),
      $emit(name) { this.events.push(name); },
      ...behavior.methods,
      ...definition.methods,
    };
    if (definition.created) definition.created.call(instance);
    instance.show = value => {
      const old = data.show;
      data.show = value;
      instance.observeShow(value, old);
    };
    return instance;
  }
  async function flush() {
    // enter -> leave -> completion contains nested Promise continuations.
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  }
  async function advance(milliseconds) {
    const end = now + milliseconds;
    await flush();
    while (timers.size > 0) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].callback();
      await flush();
    }
    now = end;
    await flush();
  }
  return { component, advance };
}

function assertOpen(instance, name) {
  assert.equal(instance.data.show, true);
  assert.equal(instance.data.display, true);
  assert.equal(instance.status, 'enter');
  assert.match(instance.data.classes, new RegExp(`van-${name}-enter-to`));
  assert.ok(instance.enterPromise);
  assert.ok(!instance.leavePromise);
}

async function assertCloses(instance, advance) {
  instance.show(false);
  await advance(700);
  assert.equal(instance.data.display, false);
  assert.equal(instance.enterPromise, null);
  assert.equal(instance.leavePromise, null);
}

for (const interval of [0, 33, 180, 700]) {
  test(`popup and overlay transition reopen after ${interval}ms and close normally`, async () => {
    const { component, advance } = createHarness();
    const popup = component('popup');
    const overlay = component('transition');
    for (const instance of [popup, overlay]) instance.show(true);
    await advance(700);
    for (const instance of [popup, overlay]) instance.show(false);
    await advance(interval);
    for (const instance of [popup, overlay]) instance.show(true);
    await advance(700);
    assertOpen(popup, 'bottom');
    assertOpen(overlay, 'fade');
    assert.equal(popup.events.filter(event => event === 'before-leave').length, 1);
    popup.onClickCloseIcon();
    popup.onClickOverlay();
    assert.equal(popup.events.filter(event => event === 'close').length, 2);
    popup.show(false);
    overlay.show(false);
    await advance(700);
    for (const instance of [popup, overlay]) {
      assert.equal(instance.data.display, false);
      assert.equal(instance.enterPromise, null);
      assert.equal(instance.leavePromise, null);
    }
  });
}

for (const finalShow of [true, false]) {
  test(`multiple toggles during leave preserve final show=${finalShow}`, async () => {
    const { component, advance } = createHarness();
    const instance = component('popup');
    instance.show(true);
    await advance(700);
    instance.show(false);
    await advance(90);
    const leavePromise = instance.leavePromise;
    instance.show(true);
    await advance(33);
    instance.show(false);
    assert.equal(instance.leavePromise, leavePromise, 'only one leave chain can own the current enter promise');
    await advance(33);
    instance.show(true);
    await advance(33);
    instance.show(finalShow);
    await advance(700);
    assert.equal(instance.events.filter(event => event === 'before-leave').length, 1);
    if (finalShow) assertOpen(instance, 'bottom');
    else {
      assert.equal(instance.data.display, false);
      assert.equal(instance.enterPromise, null);
      assert.equal(instance.leavePromise, null);
    }
    instance.show(true);
    await advance(700);
    assertOpen(instance, 'bottom');
    await assertCloses(instance, advance);
  });
}

test('closing again during replayed enter waits for the new promise', async () => {
  const { component, advance } = createHarness();
  const instance = component('popup');
  instance.show(true);
  await advance(700);
  const oldEnter = instance.enterPromise;
  instance.show(false);
  await advance(180);
  instance.show(true);
  await advance(190);
  const newEnter = instance.enterPromise;
  assert.notEqual(newEnter, oldEnter);
  assert.ok(newEnter, 'old leave must not clear the replayed enter promise');
  instance.show(false);
  instance.show(true);
  instance.show(false);
  await advance(700);
  assert.equal(instance.data.display, false);
  assert.equal(instance.enterPromise, null);
  instance.show(true);
  await advance(700);
  assertOpen(instance, 'bottom');
  await assertCloses(instance, advance);
});

test('overlay is rendered by the same van-transition behavior', () => {
  const wxml = fs.readFileSync(path.join(bundleRoot, 'overlay/overlay.wxml'), 'utf8');
  assert.match(wxml, /<van-transition[\s\S]*show="\{\{ show \}\}"/);
  assert.match(wxml, /catch:touchmove="\{\{ lockScroll \? 'noop' : ''\}\}"/);
});

test('native leave end before fallback still replays a reopen and completes close', async () => {
  const { component, advance } = createHarness();
  const instance = component('popup');
  instance.show(true);
  await advance(700);
  instance.onTransitionEnd();
  instance.show(false);
  await advance(100);
  instance.onTransitionEnd();
  assert.equal(instance.data.display, false);
  instance.show(true);
  await advance(700);
  assertOpen(instance, 'bottom');
  assert.equal(instance.events.filter(event => event === 'after-leave').length, 1);
  await assertCloses(instance, advance);
});
