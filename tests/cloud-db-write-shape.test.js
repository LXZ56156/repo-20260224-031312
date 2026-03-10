const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function listCloudFunctionFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'lib' || entry.name === 'node_modules') continue;
      out.push(...listCloudFunctionFiles(full));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

function advanceIndex(source, index) {
  const ch = source[index];
  const next = source[index + 1];
  if (ch === '/' && next === '/') {
    let i = index + 2;
    while (i < source.length && source[i] !== '\n') i += 1;
    return i;
  }
  if (ch === '/' && next === '*') {
    let i = index + 2;
    while (i < source.length - 1 && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
    return Math.min(source.length, i + 2);
  }
  if (ch === '\'' || ch === '"' || ch === '`') {
    const quote = ch;
    let i = index + 1;
    while (i < source.length) {
      if (source[i] === '\\') {
        i += 2;
        continue;
      }
      if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
        i += 2;
        let depth = 1;
        while (i < source.length && depth > 0) {
          if (source[i] === '\'' || source[i] === '"' || source[i] === '`' || (source[i] === '/' && (source[i + 1] === '/' || source[i + 1] === '*'))) {
            i = advanceIndex(source, i);
            continue;
          }
          if (source[i] === '{') depth += 1;
          else if (source[i] === '}') depth -= 1;
          i += 1;
        }
        continue;
      }
      if (source[i] === quote) return i + 1;
      i += 1;
    }
    return i;
  }
  return index + 1;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; ) {
    const ch = source[i];
    if (ch === '\'' || ch === '"' || ch === '`' || (ch === '/' && (source[i + 1] === '/' || source[i + 1] === '*'))) {
      i = advanceIndex(source, i);
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

function findRootDataObjectStart(source, objectStart, objectEnd) {
  let depth = 0;
  for (let i = objectStart + 1; i < objectEnd; ) {
    const ch = source[i];
    if (ch === '\'' || ch === '"' || ch === '`' || (ch === '/' && (source[i + 1] === '/' || source[i + 1] === '*'))) {
      i = advanceIndex(source, i);
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (depth === 0 && source.startsWith('data', i) && /[^0-9A-Za-z_$]/.test(source[i - 1] || ' ') && /[^0-9A-Za-z_$]/.test(source[i + 4] || ' ')) {
      let j = i + 4;
      while (j < objectEnd && /\s/.test(source[j])) j += 1;
      if (source[j] !== ':') {
        i += 1;
        continue;
      }
      j += 1;
      while (j < objectEnd && /\s/.test(source[j])) j += 1;
      return source[j] === '{' ? j : -1;
    }
    i += 1;
  }
  return -1;
}

function findRootReservedKey(source, objectStart, objectEnd, reservedKey) {
  let depth = 0;
  for (let i = objectStart + 1; i < objectEnd; ) {
    const ch = source[i];
    if (ch === '\'' || ch === '"' || ch === '`' || (ch === '/' && (source[i + 1] === '/' || source[i + 1] === '*'))) {
      i = advanceIndex(source, i);
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (
      depth === 0 &&
      source.startsWith(reservedKey, i) &&
      /[^0-9A-Za-z_$]/.test(source[i - 1] || ' ') &&
      /[^0-9A-Za-z_$]/.test(source[i + reservedKey.length] || ' ')
    ) {
      let j = i + reservedKey.length;
      while (j < objectEnd && /\s/.test(source[j])) j += 1;
      if (source[j] === ':') return i;
    }
    i += 1;
  }
  return -1;
}

function findForbiddenWrites(content) {
  const findings = [];
  const methodRegex = /\.(add|set|update)\s*\(/g;
  let match;
  while ((match = methodRegex.exec(content))) {
    const openParen = content.indexOf('(', match.index);
    const objectStart = content.indexOf('{', openParen);
    if (objectStart < 0) continue;
    const objectEnd = findMatchingBrace(content, objectStart);
    if (objectEnd < 0) continue;
    const dataObjectStart = findRootDataObjectStart(content, objectStart, objectEnd);
    if (dataObjectStart < 0) continue;
    const dataObjectEnd = findMatchingBrace(content, dataObjectStart);
    if (dataObjectEnd < 0) continue;
    const keyIndex = findRootReservedKey(content, dataObjectStart, dataObjectEnd, '_id');
    if (keyIndex >= 0) findings.push(keyIndex);
    methodRegex.lastIndex = objectEnd + 1;
  }
  return findings;
}

test('cloud db write payloads do not include root _id', () => {
  const files = listCloudFunctionFiles(path.join(process.cwd(), 'cloudfunctions'));
  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const index of findForbiddenWrites(content)) {
      const line = content.slice(0, index).split('\n').length;
      violations.push(`${path.relative(process.cwd(), file)}:${line}`);
    }
  }

  assert.deepEqual(violations, [], `forbidden root _id in db write payloads:\n${violations.join('\n')}`);
});
