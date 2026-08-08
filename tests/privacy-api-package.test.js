const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ci = require('miniprogram-ci');
const { getWhiteExtList } = require('../node_modules/miniprogram-ci/dist/utils/white_ext_list.js');
const {
  isNotIgnoredByProjectConfig,
} = require('../node_modules/miniprogram-ci/dist/modules/corecompiler/original/compile/common.js');

const ROOT = path.join(__dirname, '..');
const UPLOADER_IGNORE = 'miniprogram_npm/@vant/weapp/uploader/**';
const PROHIBITED_PRIVACY_APIS = /wx\.(?:getClipboardData|chooseImage|chooseMedia|chooseVideo|chooseMessageFile)\s*\(/;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

async function getUploadCandidates(config) {
  const project = new ci.Project({
    appid: 'test',
    type: 'miniProgram',
    projectPath: ROOT,
    privateKey: 'test',
  });
  const miniprogramRoot = config.miniprogramRoot || '';
  const whiteList = (await getWhiteExtList()).MiniProgramWhiteList;

  return project
    .getFileList(miniprogramRoot, '')
    .filter(isNotIgnoredByProjectConfig.bind(null, config, miniprogramRoot))
    .filter((filePath) => whiteList.has(path.posix.extname(filePath)));
}

test('upload package excludes unused Vant uploader privacy APIs', async () => {
  const config = readJson('project.config.json');
  const ignores = config.packOptions.ignore || [];
  assert.ok(
    ignores.some((item) => item.type === 'glob' && item.value === UPLOADER_IGNORE),
    `project.config.json must ignore ${UPLOADER_IGNORE}`,
  );

  const candidates = await getUploadCandidates(config);
  const uploaderFiles = candidates.filter((filePath) =>
    filePath.includes('/miniprogram_npm/@vant/weapp/uploader/'),
  );
  assert.deepEqual(uploaderFiles, []);

  const privacyApiHits = candidates.flatMap((filePath) => {
    const absolutePath = path.join(ROOT, filePath);
    const source = fs.readFileSync(absolutePath, 'utf8');
    return PROHIBITED_PRIVACY_APIS.test(source) ? [filePath] : [];
  });
  assert.deepEqual(privacyApiHits, []);

  for (const component of ['button', 'popup', 'tag']) {
    assert.ok(
      candidates.includes(`miniprogram/miniprogram_npm/@vant/weapp/${component}/index.js`),
      `used Vant component must remain uploadable: ${component}`,
    );
  }
});

test('product pages do not register the Vant uploader', () => {
  const pagesRoot = path.join(ROOT, 'miniprogram', 'pages');
  const pageConfigs = fs
    .readdirSync(pagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pagesRoot, entry.name, 'index.json'))
    .filter((filePath) => fs.existsSync(filePath));

  const registrations = pageConfigs.flatMap((filePath) => {
    const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Object.values(config.usingComponents || {}).filter((componentPath) =>
      String(componentPath).includes('@vant/weapp/uploader'),
    );
  });

  assert.deepEqual(registrations, []);
});
