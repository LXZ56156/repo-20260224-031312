const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('../miniprogram/config/productEvents');

function listJavaScriptFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files.sort();
}

test('every existing growthTracker call uses a literal allowlisted event name', () => {
  const pagesDir = path.join(__dirname, '..', 'miniprogram', 'pages');
  const names = [];
  let callCount = 0;

  for (const file of listJavaScriptFiles(pagesDir)) {
    const source = fs.readFileSync(file, 'utf8');
    callCount += [...source.matchAll(/growthTracker\.track\s*\(/g)].length;
    for (const match of source.matchAll(/growthTracker\.track\s*\(\s*(['"])([a-z0-9_]+)\1/g)) {
      names.push(match[2]);
    }
  }

  assert.equal(callCount, 22, 'growth tracking call-site count changed; update the Phase A dictionary intentionally');
  assert.equal(names.length, callCount, 'dynamic product event names are not allowed');
  assert.deepEqual([...new Set(names)].sort(), config.eventNames);
});

test('event dictionary values are bounded tokens and expose no free-text property', () => {
  assert.deepEqual(config.propertyKeys, ['t', 's', 'm', 'src', 'a', 'r']);
  assert.equal(config.eventNames.length, 19);

  for (const [name, definition] of Object.entries(config.eventDefinitions)) {
    assert.match(name, /^[a-z0-9_]{1,40}$/);
    assert.deepEqual(
      Object.keys(definition).sort(),
      Object.keys(definition).filter((key) => ['src', 'a', 'r'].includes(key)).sort(),
      `${name} has a non-allowlisted property definition`
    );
    for (const values of Object.values(definition)) {
      assert.ok(Array.isArray(values) && values.length > 0);
      assert.ok(values.length <= 10);
      for (const value of values) assert.match(value, /^[a-z0-9_]{1,40}$/);
    }
  }
});
