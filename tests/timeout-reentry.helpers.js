function installFakeTimers() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const queue = [];
  const active = new Set();

  global.setTimeout = (fn, delay) => {
    const handle = { fn, delay };
    active.add(handle);
    queue.push(handle);
    return handle;
  };
  global.clearTimeout = (handle) => {
    active.delete(handle);
  };

  return {
    async flushAll() {
      while (queue.length) {
        const handle = queue.shift();
        if (!active.has(handle)) continue;
        active.delete(handle);
        await handle.fn();
      }
    },
    restore() {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  };
}

function createDeferred() {
  let resolve = null;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createWxStub() {
  const loadingEvents = [];
  const pendingModalTasks = [];
  let loadingVisible = false;
  let hideWithoutVisibleError = null;
  let modalCalls = 0;

  return {
    loadingEvents,
    pendingModalTasks,
    getHideError() {
      return hideWithoutVisibleError;
    },
    getModalCalls() {
      return modalCalls;
    },
    api: {
      showLoading(options = {}) {
        loadingEvents.push(`show:${String(options.title || '')}`);
        loadingVisible = true;
      },
      hideLoading() {
        loadingEvents.push('hide');
        if (!loadingVisible) {
          hideWithoutVisibleError = new Error('hideLoading called without visible loading');
          throw hideWithoutVisibleError;
        }
        loadingVisible = false;
      },
      showToast() {},
      showModal(options = {}) {
        modalCalls += 1;
        const task = options && typeof options.success === 'function'
          ? options.success({ confirm: true, cancel: false })
          : null;
        if (task && typeof task.then === 'function') pendingModalTasks.push(task);
      },
      navigateTo() {},
      redirectTo() {},
      switchTab() {},
      navigateBack(options = {}) {
        if (typeof options.fail === 'function') options.fail();
      },
      pageScrollTo() {},
      getStorageSync() {
        return undefined;
      },
      setStorageSync() {},
      removeStorageSync() {}
    }
  };
}

function loadPageDefinition(pagePath) {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[pagePath];
  require(pagePath);
  global.Page = originalPage;
  return definition;
}

function createPageContext(definition, dataOverrides = {}) {
  const ctx = {
    data: { ...JSON.parse(JSON.stringify((definition && definition.data) || {})), ...dataOverrides },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  Object.keys(definition || {}).forEach((key) => {
    if (typeof definition[key] === 'function') ctx[key] = definition[key];
  });
  return ctx;
}

function createContext(methods, data = {}) {
  const ctx = {
    data: { ...(data || {}) },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  Object.keys(methods || {}).forEach((key) => {
    if (typeof methods[key] === 'function') ctx[key] = methods[key];
  });
  return ctx;
}

async function settleTasks(tasks) {
  await Promise.allSettled((tasks || []).filter((task) => task && typeof task.then === 'function'));
}

module.exports = {
  installFakeTimers,
  createDeferred,
  createWxStub,
  loadPageDefinition,
  createPageContext,
  createContext,
  settleTasks
};
