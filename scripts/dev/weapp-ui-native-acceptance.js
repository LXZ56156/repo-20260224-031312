'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const t = require('./weapp-ui-screenshot');
const { nativeIsolationRuntime } = require('./weapp-ui-native-isolation');
const { buildNativeFixtures } = require('./weapp-ui-native-fixtures');
const { createNativeRecovery } = require('./weapp-ui-native-recovery');

async function startNativeAcceptance() {
  if (process.env.COMPUTERNAME !== 'VM') throw Error('This acceptance run is authorized only on VM');
  const config = t.readRuntimeConfig({ ...process.env, WEAPP_CAPTURE_SURFACE: 'simulator-frame' }, t.REPOSITORY_ROOT, { allowSessionFallback: true });
  const lock = t.acquireSessionLock(config.sessionFile, 'native-ui-acceptance');
  const token = crypto.randomBytes(24).toString('hex');
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${token.slice(0, 8)}`;
  const directory = path.join(t.REPOSITORY_ROOT, 'tmp/native-ui-acceptance', runId);
  fs.mkdirSync(directory, { recursive: true });
  const fixtures = buildNativeFixtures();
  const report = { kind: 'manual-native-interaction-observation-v1', runId, startedAt: new Date().toISOString(),
    sourceManifestHash: t.hashCanonical(t.currentGitManifest()), sessionFile: config.sessionFile,
    noNativeChoiceMocks: true, observations: [], cleanup: null };
  // This nonce is not a credential; original storage/globalData values stay only in AppService.
  const recoveryPath = path.join(directory, 'owner-recovery.local.json');
  const recovery = { kind: 'native-acceptance-owner-recovery-v1', token, sessionFile: config.sessionFile,
    sourceManifestHash: report.sourceManifestHash, lockOwner: lock, active: true };
  fs.writeFileSync(recoveryPath, JSON.stringify(recovery, null, 2));
  let connection, installed = false, finished = false;
  const save = () => fs.writeFileSync(path.join(directory, 'observations.json'), JSON.stringify(report, null, 2));
  const runtime = (command, payload) => t.timeout(connection.miniProgram.evaluate(nativeIsolationRuntime, command, token, payload || {}), 10000, `native-isolation:${command}`);
  async function binding() {
    const result = await t.verifySessionBinding(connection.miniProgram, config);
    if (!result.ok || t.hashCanonical(t.currentGitManifest()) !== report.sourceManifestHash) throw Error('Native acceptance source/session binding changed');
    return result.checks;
  }
  async function finish() {
    if (finished) return report.cleanup;
    let neutral, restored;
    try {
      if (installed === 'unknown') {
        const status = await runtime('status');
        if (status.ok) installed = true;
        else if (status.present === false) installed = false;
        else throw Error('Isolation installation outcome is unknown; preserve the recovery owner');
      }
      if (installed) {
        if (!(await runtime('quiesce')).ok) throw Error('Cannot quiesce the owned isolation');
        // Close page timers/watchers through real lifecycle teardown under guards.
        try { neutral = await t.cleanupCaptureRun(connection.miniProgram); }
        finally { restored = await runtime('finish', { neutral: !!neutral && neutral.ok }); }
        report.cleanup = { neutral, restored };
        if (!neutral || !neutral.ok || !restored || !restored.ok) throw Error('Native isolation retained: cleanup not verified');
        recovery.active = false;
        fs.writeFileSync(recoveryPath, JSON.stringify(recovery, null, 2));
        report.afterChecks = await binding();
      } else report.cleanup = { ok: true, installed: false };
      recovery.active = false;
      fs.writeFileSync(recoveryPath, JSON.stringify(recovery, null, 2));
      return report.cleanup;
    } catch (error) {
      report.cleanup = { ...report.cleanup, error: String(error.message || error), neutral, restored, outcome: 'not-verified' };
      throw error;
    } finally {
      finished = true; report.finishedAt = new Date().toISOString(); save();
      if (connection) connection.miniProgram.disconnect();
      t.releaseSessionLockOrThrow(lock);
    }
  }
  async function guarded(action) {
    if (finished) throw Error('Native acceptance session is finished');
    try { return await action(); }
    catch (error) {
      try { await finish(); } catch (cleanupError) { error.cleanupError = cleanupError.message; }
      throw error;
    }
  }
  const session = { directory, report,
    step: action => guarded(async () => { await binding(); const value = await action(session); await binding(); return value; }),
    open: name => guarded(async () => {
      const entry = fixtures.entries[name]; if (!entry) throw Error('Unknown native fixture case');
      await binding();
      if ((await runtime('status')).nativePending) throw Error('Close the real native dialog before changing cases');
      const armed = await runtime('arm', { kind: 'observe' }); if (!armed.ok) throw Error('Cannot reset write phase');
      const page = await t.routeCasePage(connection.miniProgram, 'reLaunch', entry.path);
      const base = t.cases[entry.baseCase || name];
      // Interactive fixtures load the complete production preset (including its
      // shortcut row), rather than the static screenshot's reduced projection.
      const item = { ...base, selectorExpectations: {
        ...base.selectorExpectations, ...entry.selectorExpectations,
        ...(entry.formLabels ? { '#section-params .form-label': entry.formLabels.length } : {}),
      } };
      await t.waitForCaseReady(page, item, config.readinessTimeoutMs);
      if (entry.formLabels) {
        const labels = [];
        for (const element of await page.$$('#section-params .form-label')) labels.push((await element.text()).trim());
        if (JSON.stringify(labels) !== JSON.stringify(entry.formLabels)) throw Error('Interactive preset field labels changed');
      }
      await t.waitForVisualSettle(page, item);
      const data = await page.data();
      if (data.tournamentId !== entry.id || !data.tournament || data.tournament._id !== entry.id) throw Error('Actual page did not load the isolated fixture');
      report.currentCase = name; return session.inspect();
    }),
    inspect: () => guarded(async () => {
      const checks = await binding();
      const state = await runtime('status');
      const page = await connection.miniProgram.currentPage();
      const data = await page.data();
      const selected = Object.fromEntries(['tournamentId', 'schedulerProfile', 'schedulerProfileIndex', 'schedulerProfileDisplayLabel', 'schedulerProfileHint', 'settingsBusy', 'joinBusy', 'isDraft', 'canManageTournament', 'canConfigureSettings'].filter(key => data[key] !== undefined).map(key => [key, data[key]]));
      if (data.tournament) selected.tournament = { id: data.tournament._id, version: data.tournament.version,
        players: (data.tournament.players || []).map(player => ({ id: player.id, type: player.type, claimedGuestId: player.claimedGuestId, squad: player.squad })), creatorId: data.tournament.creatorId };
      const value = { at: new Date().toISOString(), checks, route: page.path, data: selected, state };
      report.observations.push(value); save(); return value;
    }),
    armSave: profile => guarded(async () => {
      await binding();
      const page = await connection.miniProgram.currentPage(), data = await page.data();
      if (data.schedulerProfile !== profile || !fixtures.settingsIds.includes(data.tournamentId)) throw Error('The real picker must select the expected profile before arming save');
      const result = await runtime('arm', { kind: 'save', tournamentId: data.tournamentId, schedulerProfile: profile });
      if (!result.ok) throw Error('Save phase rejected'); return result;
    }),
    armJoin: () => guarded(async () => {
      await binding();
      const page = await connection.miniProgram.currentPage(), data = await page.data();
      if (data.tournamentId !== fixtures.joinId || data.joinBusy) throw Error('Open the non-full ordinary-join fixture first');
      const result = await runtime('document', { id: fixtures.joinId });
      const armed = await runtime('arm', { kind: 'join', tournamentId: fixtures.joinId, expectedVersion: Number(result.document.version) || 1 });
      if (!armed.ok) throw Error('Ordinary join phase rejected'); return armed;
    }),
    armClaim: guestId => guarded(async () => {
      await binding();
      const result = await runtime('document', { id: fixtures.claimId });
      const armed = await runtime('arm', { kind: 'claim', tournamentId: fixtures.claimId, claimGuestId: guestId, expectedVersion: Number(result.document.version) || 1 });
      if (!armed.ok) throw Error('Claim phase rejected'); return armed;
    }),
    capture: label => guarded(async () => {
      if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw Error('Use a simple unique capture label');
      const target = path.join(directory, `${label}.png`); if (fs.existsSync(target)) throw Error('Evidence already exists');
      const before = await session.inspect();
      await t.timeout(connection.miniProgram.screenshot({ path: target }), 15000, 'native-observation:App.captureScreenshot');
      const after = await session.inspect();
      const value = { label, target, method: 'App.captureScreenshot', png: t.inspectPngFile(target), before, after };
      report.observations.push(value); save(); return value;
    }),
    finish,
  };
  try {
    connection = await t.openMiniProgram(config, { requireSession: true });
    report.beforeChecks = await binding();
    installed = 'unknown';
    const result = await runtime('install', fixtures);
    installed = result.ok === true || result.retained === true;
    report.installation = result; save();
    if (!result.ok || !result.verified) throw Error('Native isolation installation failed');
    return session;
  } catch (error) {
    try { await finish(); } catch (cleanupError) { error.cleanupError = cleanupError.message; }
    throw error;
  }
}

async function withNativeAcceptance(caseName, action) {
  const session = await startNativeAcceptance();
  try { if (caseName) await session.open(caseName); return await action(session); }
  finally { await session.finish(); }
}

async function recoverNativeAcceptance(file) {
  const result = await createNativeRecovery(t, nativeIsolationRuntime).recover(file,
    path.join(path.dirname(path.resolve(file)), 'recovery-result.local.json'));
  return result.restored;
}

if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== '--self-check') {
    console.error('Use --self-check, or require this module in the supported node_repl and await withNativeAcceptance(caseName, async session => { ...real sky actions... }).');
    process.exitCode = 1;
  } else withNativeAcceptance(null, async session => session.inspect()).then(() => {
    console.log('Isolation self-check and finally cleanup passed; no native choices or writes performed.');
  }).catch(error => { console.error(error.stack); process.exitCode = 1; });
}

module.exports = { startNativeAcceptance, withNativeAcceptance, recoverNativeAcceptance };
