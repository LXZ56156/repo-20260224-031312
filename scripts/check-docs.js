#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_FILES = [
  'AGENTS.md',
  'docs/README.md',
  'docs/tasks/current.md',
  'docs/status/project-state.md',
  'docs/status/cleanup-candidates.md',
  'docs/status/release-ledger.md',
  'docs/status/maintenance-policy.md',
  'docs/status/worktree-inventory.md'
];
const STABLE_AGENT_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md'
];

function walkMarkdownFiles(rootDir) {
  const results = [];
  const ignoredDirectories = new Set(['.git', 'node_modules', '.cache', '.tmp', 'tmp']);
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.md')) results.push(fullPath);
    }
  }
  visit(rootDir);
  return results.sort();
}

function walkGovernancePathFiles(repoDir) {
  const results = [];
  const roots = ['control', 'docs/status'];
  const extensions = new Set(['.md', '.json', '.jsonl']);
  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && extensions.has(path.extname(entry.name))) results.push(fullPath);
    }
  }
  for (const root of roots) visit(path.join(repoDir, root));
  return results.sort();
}

function extractMarkdownLinks(text) {
  const links = [];
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of String(text).matchAll(pattern)) {
    let target = match[1].trim();
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    target = target.split(/\s+["']/)[0];
    if (!target || target.startsWith('#') || /^(?:https?:|mailto:|data:|app:)/i.test(target)) continue;
    links.push(target.split('#')[0]);
  }
  return links;
}

function findVolatileFacts(text) {
  const facts = [];
  if (/\b[0-9a-f]{7,40}\b/i.test(text)) facts.push('commit hash');
  if (/ws:\/\/127\.0\.0\.1:\d+/i.test(text)) facts.push('fixed automation endpoint');
  return facts;
}

function findMalformedProjectPaths(text) {
  const malformed = [
    /D:\/projects\/WIN\//i,
    /D:\/projects\/WIN\)/i,
    /D:\\projects\\WIN\\/i,
    /D:\\projects\\WIN\)/i
  ];
  return malformed.some((pattern) => pattern.test(String(text)));
}

function validateRepositoryDocs(repoDir = ROOT) {
  const errors = [];
  for (const relativePath of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(repoDir, relativePath))) {
      errors.push(`missing required file: ${relativePath}`);
      continue;
    }
    const ignored = spawnSync('git', ['check-ignore', '-q', '--', relativePath], {
      cwd: repoDir,
      windowsHide: true,
      shell: false
    });
    if (ignored.status === 0) errors.push(`required documentation is ignored by Git: ${relativePath}`);
  }

  const markdownFiles = walkMarkdownFiles(repoDir);
  let checkedLocalLinks = 0;
  for (const filePath of markdownFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const target of extractMarkdownLinks(text)) {
      checkedLocalLinks += 1;
      const decoded = decodeURIComponent(target);
      const resolved = path.resolve(path.dirname(filePath), decoded);
      if (!fs.existsSync(resolved)) {
        errors.push(`broken local link: ${path.relative(repoDir, filePath)} -> ${target}`);
      }
    }
  }

  for (const filePath of walkGovernancePathFiles(repoDir)) {
    const text = fs.readFileSync(filePath, 'utf8');
    if (findMalformedProjectPaths(text)) {
      const relativePath = path.relative(repoDir, filePath).replace(/\\/g, '/');
      errors.push(`malformed Windows project path in current governance: ${relativePath}`);
    }
  }

  for (const relativePath of STABLE_AGENT_FILES) {
    const fullPath = path.join(repoDir, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    const facts = findVolatileFacts(fs.readFileSync(fullPath, 'utf8'));
    for (const fact of facts) errors.push(`volatile ${fact} in stable agent file: ${relativePath}`);
  }

  const currentPath = path.join(repoDir, 'docs/tasks/current.md');
  if (fs.existsSync(currentPath)) {
    const currentText = fs.readFileSync(currentPath, 'utf8');
    const lineCount = currentText.split(/\r?\n/).length;
    if (lineCount > 50) errors.push(`docs/tasks/current.md exceeds 50 lines: ${lineCount}`);
    if (!/docs\/status\//.test(currentText)) errors.push('docs/tasks/current.md must point to docs/status/');
  }

  const taskDir = path.join(repoDir, 'docs/tasks');
  if (fs.existsSync(taskDir)) {
    const allowedTopLevel = new Set([
      'current.md'
    ]);
    for (const entry of fs.readdirSync(taskDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md') && !allowedTopLevel.has(entry.name)) {
        errors.push(`unexpected active task document; archive or classify it: docs/tasks/${entry.name}`);
      }
    }
  }

  return { errors, checkedMarkdownFiles: markdownFiles.length, checkedLocalLinks };
}

function main() {
  const result = validateRepositoryDocs(ROOT);
  console.log(`docs:check: ${result.checkedMarkdownFiles} Markdown files, ${result.checkedLocalLinks} local links`);
  if (result.errors.length) {
    for (const error of result.errors) console.error(`- ${error}`);
    return 1;
  }
  console.log('docs:check passed');
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  extractMarkdownLinks,
  findMalformedProjectPaths,
  findVolatileFacts,
  validateRepositoryDocs,
  walkGovernancePathFiles,
  walkMarkdownFiles
};
