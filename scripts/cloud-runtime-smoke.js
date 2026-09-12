'use strict';

// These requests stop before mutations; read-only endpoints only query/context-read.
const manifest = {};
for (const name of ['addPlayers', 'generateShareCode', 'joinTournament', 'manageActivityId',
  'managePairTeams', 'removePlayer', 'setPlayerSquad', 'setReferee', 'startTournament',
  'submitScore', 'updateSettings']) {
  manifest[name] = { payload: {}, codes: ['TOURNAMENT_ID_REQUIRED'] };
}
Object.assign(manifest, {
  cloneTournament: { payload: {}, codes: ['SOURCE_TOURNAMENT_ID_REQUIRED'] },
  createTournament: { payload: { name: '', mode: 'multi_rotate', presetKey: 'custom' }, codes: ['SETTINGS_INVALID'] },
  feedbackSubmit: { payload: {}, codes: ['FEEDBACK_CONTENT_TOO_SHORT'] },
  saveUserProfile: { payload: {}, codes: ['PROFILE_NICKNAME_REQUIRED'] },
  scoreLock: { payload: {}, codes: ['ACTION_REQUIRED'] },
  deleteTournament: { payload: {}, errorMessage: '缺少 tournamentId' },
  resetTournament: { payload: {}, errorMessage: '缺少 tournamentId' },
  rebuildRankings: { payload: {}, errorMessage: 'missing tournamentId' },
  login: { payload: {}, codes: ['LOGIN_OK'], readOnly: true },
  getUserProfile: { payload: {}, codes: ['PROFILE_READY'], readOnly: true, loadOnlyCodes: ['PROFILE_LOAD_FAILED'] },
  getMyPerformanceStats: { payload: {}, codes: ['PERFORMANCE_STATS_READY'], readOnly: true },
  waterSession: { payload: { apiVersion: 2, action: '__smoke_invalid__' }, codes: ['PERMISSION_DENIED', 'WATER_ENTRY_INVALID'] }
});

function parse(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function isExpectedThrow(message, expected) {
  const lines = String(message || '').trim().split(/\r?\n/);
  return (lines[0] === expected || lines[0] === `Error: ${expected}`)
    && lines.slice(1).every(line => /^\s+at\s/.test(line));
}

function validateInvokeResult(name, output, exitCode = 0) {
  const expected = manifest[name];
  const fail = reason => ({ ok: false, name, reason });
  if (!expected) return fail('unknown function');
  if (exitCode !== 0) return fail('CLI failed');
  let envelope;
  let result;
  try {
    const root = parse(output);
    envelope = root && root.data;
    if (!envelope || !Object.prototype.hasOwnProperty.call(envelope, 'RetMsg')) return fail('missing RetMsg');
    result = parse(envelope.RetMsg);
  } catch (_) { return fail('invalid invoke JSON'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return fail('missing application result');
  if (expected.errorMessage) {
    const exception = result.errorMessage === 'user code exception caught'
      ? result.stackTrace : result.errorMessage;
    if (!isExpectedThrow(exception, expected.errorMessage)) return fail('unexpected runtime error');
    if (envelope.ErrMsg && !isExpectedThrow(envelope.ErrMsg, expected.errorMessage)) return fail('platform error');
    return { ok: true, name, evidence: expected.errorMessage };
  }
  if (envelope.ErrMsg || Number(envelope.InvokeResult) !== 0) return fail('platform invocation failed');
  if (result.error || result.errorCode || result.errorMessage) return fail('nested runtime error');
  if (result.ok === false && (expected.loadOnlyCodes || []).includes(result.code)) {
    return { ok: true, name, evidence: result.code, scope: 'handler-loaded-only', limitation: 'Profile read and user identity are not verified' };
  }
  if (result.ok !== !!expected.readOnly || !expected.codes.includes(result.code)) return fail('unexpected application result');
  return { ok: true, name, evidence: result.code };
}

if (require.main === module) {
  const [name, file] = process.argv.slice(2);
  if (name === '--payload' && manifest[file]) {
    console.log(JSON.stringify(manifest[file].payload));
  } else if (manifest[name] && file) {
    try {
      const outcome = validateInvokeResult(name, require('node:fs').readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      console.log(JSON.stringify(outcome));
      process.exitCode = outcome.ok ? 0 : 1;
    } catch (_) {
      console.error('Cannot read invoke JSON file');
      process.exitCode = 1;
    }
  } else {
    console.error('Usage: cloud-runtime-smoke.js <functionName> <invoke-json-file> | --payload <functionName>');
    process.exitCode = 1;
  }
}

module.exports = { manifest, validateInvokeResult };
