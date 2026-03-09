const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function discoverTemplates(rootDir) {
  return fs.readdirSync(path.join(rootDir, 'scripts'))
    .filter((name) => name.endsWith('-common.template.js'))
    .sort()
    .map((name) => path.join(rootDir, 'scripts', name));
}

function templateTargetBasename(templatePath) {
  const templateName = path.basename(templatePath);
  if (templateName === 'cloud-common.template.js') return 'common';
  return templateName.replace(/-common\.template\.js$/, '');
}

test('cloud shared lib templates match current cloudfunctions lib copies', () => {
  const rootDir = process.cwd();
  const templates = discoverTemplates(rootDir);
  assert.ok(templates.length >= 3);

  const cloudfunctionsDir = path.join(rootDir, 'cloudfunctions');
  const cloudfunctions = fs.readdirSync(cloudfunctionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(cloudfunctionsDir, entry.name))
    .sort();

  for (const fnDir of cloudfunctions) {
    for (const templatePath of templates) {
      const expectedPath = path.join(fnDir, 'lib', `${templateTargetBasename(templatePath)}.js`);
      assert.equal(fs.existsSync(expectedPath), true, `missing shared lib: ${expectedPath}`);
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      const actualContent = fs.readFileSync(expectedPath, 'utf8');
      assert.equal(actualContent, templateContent, `shared lib mismatch: ${expectedPath}`);
    }
  }
});
