const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const vm = require('node:vm');

// Resolve from the actual build-tool consumers, not an unrelated top-level copy.
const ciRequire = createRequire(require.resolve('miniprogram-ci/package.json'));
const requestRequire = createRequire(ciRequire.resolve('request'));

test('patched request multipart dependency preserves text, CRLF values and binary uploads offline', () => {
  const FormData = requestRequire('form-data');
  const form = new FormData();
  form.append('plain', 'hello');
  form.append('text', '中文\r\n第二行');
  form.append('file', Buffer.from([0, 1, 254, 255]), { filename: '测试.png', contentType: 'image/png' });
  const buffer = form.getBuffer();
  const text = buffer.toString('utf8');
  assert.match(form.getHeaders()['content-type'], /^multipart\/form-data; boundary=/);
  assert.ok(text.includes('中文\r\n第二行'));
  assert.ok(text.includes('filename="测试.png"'));
  assert.ok(text.includes('Content-Type: image/png'));
  assert.ok(buffer.includes(Buffer.from([0, 1, 254, 255])));
  assert.equal(form.getLengthSync(), buffer.length);
  assert.ok(text.endsWith(`--${form.getBoundary()}--\r\n`));
});

test('patched CI minimatch preserves project glob and brace exclusions', () => {
  const minimatch = ciRequire('minimatch');
  assert.equal(minimatch('pages/home/index.js', 'pages/**/*.{js,json}'), true);
  assert.equal(minimatch('pages/home/index.wxml', 'pages/**/*.{js,json}'), false);
  assert.equal(minimatch('cloudfunctions/a/index.js', '!node_modules/**'), true);
  assert.equal(minimatch('node_modules/a/index.js', '!node_modules/**'), false);
  assert.deepEqual(minimatch.braceExpand('{pages,components}/{home,{list,detail}}.js'), [
    'pages/home.js', 'pages/list.js', 'pages/detail.js',
    'components/home.js', 'components/list.js', 'components/detail.js'
  ]);
});

test('patched CI terser keeps its synchronous API, semantics, comments and sourcemaps', () => {
  const terser = ciRequire('terser');
  for (const input of ['/*! keep */ var result=(function(x){return x+1})(4);', '/*! keep */ const add=x=>x+1; var result=add(4);']) {
    const result = terser.minify({ 'input.js': input }, {
      output: { comments: /^!/ }, sourceMap: { filename: 'output.js', url: 'output.js.map' }
    });
    assert.equal(typeof result.then, 'undefined');
    assert.equal(result.error, undefined);
    assert.ok(result.code.includes('keep'));
    const sandbox = {};
    vm.runInNewContext(result.code, sandbox, { timeout: 1000 });
    assert.equal(sandbox.result, 5);
    assert.deepEqual(JSON.parse(result.map).sources, ['input.js']);
  }
});

test('patched multipart escapes CRLF in field names and filenames', () => {
  const FormData = requestRequire('form-data');
  const form = new FormData();
  form.append('field\r\nX-Injected: yes', Buffer.from('x'), { filename: 'file\r\nX-Injected: yes.png' });
  const text = form.getBuffer().toString();
  assert.ok(text.includes('field%0D%0AX-Injected: yes'));
  assert.ok(text.includes('file%0D%0AX-Injected: yes.png'));
  assert.equal(text.includes('\r\nX-Injected:'), false);
});

test('patched readdir-glob brace expansion preserves the independent v2 consumer', () => {
  const globRequire = createRequire(require.resolve('readdir-glob/package.json'));
  const minimatchRequire = createRequire(globRequire.resolve('minimatch'));
  const expand = minimatchRequire('brace-expansion');
  assert.deepEqual(expand('{pages,components}/{home,{list,detail}}.js'), [
    'pages/home.js', 'pages/list.js', 'pages/detail.js',
    'components/home.js', 'components/list.js', 'components/detail.js'
  ]);
});
