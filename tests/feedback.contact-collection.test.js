const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const actionGuard = require('../miniprogram/core/actionGuard');
const cloud = require('../miniprogram/core/cloud');

const pagePath = require.resolve('../miniprogram/pages/feedback/index.js');
const root = path.resolve(__dirname, '..');

function loadPageDefinition() {
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

function createPageContext(definition, data = {}) {
  const ctx = {
    data: {
      ...JSON.parse(JSON.stringify(definition.data || {})),
      ...data
    },
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  Object.keys(definition || {}).forEach((key) => {
    if (typeof definition[key] === 'function') ctx[key] = definition[key];
  });
  return ctx;
}

test('feedback page no longer renders or holds contact information fields', () => {
  const wxml = fs.readFileSync(path.join(root, 'miniprogram/pages/feedback/index.wxml'), 'utf8');
  const definition = loadPageDefinition();

  assert.doesNotMatch(wxml, /联系方式|微信号|手机号|邮箱|contact|onContactInput/);
  assert.equal(Object.hasOwn(definition.data, 'contact'), false);
  assert.equal(typeof definition.onContactInput, 'undefined');

  delete require.cache[pagePath];
});

test('feedback submit sends only category content and the request id', async () => {
  const originalWx = global.wx;
  const originalCall = cloud.call;
  let captured = null;

  global.wx = {
    showLoading() {},
    hideLoading() {},
    showToast() {},
    showModal() {}
  };

  try {
    const definition = loadPageDefinition();
    const ctx = createPageContext(definition, {
      blocked: false,
      categoryIndex: 1,
      content: '这是一条足够长的体验建议反馈内容。',
      contentLength: 17,
      submitting: false
    });

    cloud.call = async (name, payload) => {
      assert.equal(name, 'feedbackSubmit');
      captured = payload;
      return {
        ok: true,
        code: 'FEEDBACK_SAVED',
        state: 'saved',
        feedbackId: 'fb_contact_free'
      };
    };

    await ctx.onSubmit({ clientRequestId: 'req_feedback_contact_free' });

    assert.deepEqual(captured, {
      category: '体验建议',
      content: '这是一条足够长的体验建议反馈内容。',
      clientRequestId: 'req_feedback_contact_free'
    });
  } finally {
    actionGuard.clear('feedback:submit');
    global.wx = originalWx;
    cloud.call = originalCall;
    delete require.cache[pagePath];
  }
});
