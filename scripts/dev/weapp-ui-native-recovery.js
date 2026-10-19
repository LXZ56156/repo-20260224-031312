'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Recovery is a separate capability: ordinary capture never accepts its barrier.
function createNativeRecovery(t, nativeIsolationRuntime) {
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const same = (a, b) => ['kind', 'token', 'purpose', 'processId', 'processStartFileTimeUtc', 'sessionFile', 'createdAt']
    .every(key => a && b && a[key] === b[key]);
  function inspectOwner(file) {
    if (process.env.COMPUTERNAME !== 'VM') throw Error('Recovery is authorized only on VM');
    const root = fs.realpathSync(path.join(t.REPOSITORY_ROOT, 'tmp/native-ui-acceptance')) + path.sep;
    const target = fs.realpathSync(file);
    if (!target.startsWith(root) || path.basename(target) !== 'owner-recovery.local.json') throw Error('Recovery file is outside this exact checkout');
    const recovery = read(target), directory = path.dirname(target), report = read(path.join(directory, 'observations.json'));
    const hash = t.hashCanonical(t.currentGitManifest());
    if (recovery.kind !== 'native-acceptance-owner-recovery-v1' || recovery.active !== true
        || !/^[a-f0-9]{48}$/.test(recovery.token || '') || recovery.sourceManifestHash !== hash
        || report.sourceManifestHash !== hash || report.runId !== path.basename(directory)) throw Error('Recovery owner/source mismatch');
    const config = t.readRuntimeConfig({ ...process.env, WEAPP_UI_SESSION_FILE: recovery.sessionFile }, t.REPOSITORY_ROOT, { allowSessionFallback: true });
    if (path.resolve(recovery.sessionFile) !== config.sessionFile || config.session.gitManifestHash !== hash
        || !t.validateRuntimeConfig(config, { requireSession: true }).ok || !t.validateSessionRecord(config.session, config).ok) throw Error('Recovery session/source mismatch or existing recovery barrier');
    const original = read(`${config.sessionFile}.lock`);
    const runParts = /^(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z)-(\d+)-([a-f0-9]{8})$/.exec(report.runId);
    if (!runParts || Number(runParts[2]) !== original.processId || runParts[3] !== recovery.token.slice(0, 8)
        || original.kind !== 'weapp-ui-session-lock-v1' || original.purpose !== 'native-ui-acceptance'
        || original.sessionFile !== config.sessionFile || !/^[a-f0-9]{48}$/.test(original.token || '')
        || !/^\d+$/.test(original.processStartFileTimeUtc || '')
        || !Number.isFinite(Date.parse(original.createdAt)) || !Number.isFinite(Date.parse(report.startedAt))
        || Math.abs(Date.parse(report.startedAt) - Date.parse(original.createdAt)) > 2000
        || report.sessionFile !== config.sessionFile || !report.installation || report.installation.verified !== true
        || !report.beforeChecks || Object.values(report.beforeChecks).length !== 8 || !Object.values(report.beforeChecks).every(value => value === true)
        || (recovery.lockOwner && !same(recovery.lockOwner, original))) throw Error('Recovery original lock owner mismatch');
    function deadOwner() {
      const identity = t.resolveProcessIdentity(original.processId);
      if (!identity || (identity.ok !== true && identity.reason !== 'not-found')) throw Error('Original owner liveness is unknown');
      if (identity.ok === true && String(identity.processStartFileTimeUtc) === original.processStartFileTimeUtc) throw Error('Original owner is still active');
      return identity;
    }
    const ownerIdentity = deadOwner();
    return { target, recovery, config, original, ownerIdentity, deadOwner };
  }
  function acquireRecovery(context) {
    const { config, original, deadOwner } = context;
    if (!same(read(`${config.sessionFile}.lock`), original)) throw Error('Recovery lock changed before claim');
    deadOwner();
    const lock = t.acquireSessionLock(config.sessionFile, 'native-isolation-recovery', {
      allowStaleRecovery: true,
      expectedNativeRecoveryOwner: original,
      beforeStaleRecheck({ existing, lockFile }) {
        if (!same(existing, original) || !same(read(lockFile), original)) throw Error('Recovery owner changed during claim');
        deadOwner();
      },
    });
    function assertOwned() {
      const barrier = read(t.sessionRecoveryFile(config.sessionFile));
      if (!same(read(lock.lockFile), lock) || barrier.kind !== 'weapp-ui-session-recovery-v1'
          || barrier.sessionFile !== config.sessionFile || barrier.staleToken !== original.token
          || barrier.staleProcessId !== original.processId || barrier.staleProcessStartFileTimeUtc !== original.processStartFileTimeUtc
          || barrier.claimantToken !== lock.token || barrier.claimantProcessId !== lock.processId
          || barrier.claimantProcessStartFileTimeUtc !== lock.processStartFileTimeUtc) throw Error('Recovery barrier/claim ownership mismatch');
      if (t.hashCanonical(t.currentGitManifest()) !== context.recovery.sourceManifestHash) throw Error('Recovery source changed');
    }
    try { assertOwned(); } catch (error) { t.releaseSessionLockOrThrow(lock); throw error; }
    return { lock, assertOwned };
  }
  async function recover(file, evidenceFile) {
    const context = inspectOwner(file), claim = acquireRecovery(context);
    const { config, recovery, target } = context;
    const evidence = { kind: 'native-isolation-orphan-recovery-v1', startedAt: new Date().toISOString(),
      originalOwner: context.original, ownerIdentity: context.ownerIdentity, sourceManifestHash: recovery.sourceManifestHash };
    const save = () => { if (evidenceFile) t.writeJsonAtomically(evidenceFile, evidence); };
    let connection, failure;
    try {
      // Config was fully validated immediately before claiming. The durable
      // barrier stays on disk; only this exact claimant can use that snapshot.
      claim.assertOwned();
      connection = await t.openMiniProgram(config, { requireSession: true });
      const binding = async () => {
        claim.assertOwned();
        const result = await t.verifySessionBinding(connection.miniProgram, config);
        if (!result.ok) throw Error('Recovery session binding failed');
        return result.checks;
      };
      const run = (command, payload) => {
        claim.assertOwned();
        return t.timeout(connection.miniProgram.evaluate(nativeIsolationRuntime, command, recovery.token, payload || {}), 10000, `native-recovery:${command}`);
      };
      evidence.beforeChecks = await binding();
      evidence.status = await run('status'); save();
      if (!evidence.status.ok || !evidence.status.guardsVerified) throw Error('Owned isolation/guards are absent or unknown');
      evidence.quiesced = await run('quiesce'); save();
      if (!evidence.quiesced.ok) throw Error('Cannot quiesce the original isolation');
      try { evidence.neutral = await t.cleanupCaptureRun(connection.miniProgram); }
      finally { evidence.restored = await run('finish', { neutral: !!evidence.neutral && evidence.neutral.ok }); save(); }
      const r = evidence.restored;
      if (!evidence.neutral || !evidence.neutral.ok || !r || !r.ok || r.retained !== false
          || !r.storageRestored || !r.globalDataRestored || !r.sdkRestored || !r.neutralViewRefreshed
          || r.watchersRemaining !== 0 || r.listenersRemaining !== 0 || r.nativePending !== 0) throw Error('Original isolation restoration remains unverified');
      evidence.afterChecks = await binding();
      const absent = await run('status'); evidence.afterStatus = absent;
      if (absent.present !== false) throw Error('Isolation guard state remains present');
      claim.assertOwned();
      recovery.active = false; recovery.cleanup = r;
      t.writeJsonAtomically(target, recovery);
      if (!t.clearSessionRecovery(config.sessionFile).ok) throw Error('Cannot clear the owned recovery barrier');
      evidence.ok = true;
    } catch (error) { failure = error; evidence.error = String(error.stack || error); }
    finally {
      try { if (connection) connection.miniProgram.disconnect(); }
      catch (error) { evidence.disconnectError = String(error.message || error); }
      try { evidence.release = t.releaseSessionLock(claim.lock); }
      catch (error) { evidence.release = { ok: false, reason: String(error.message || error) }; }
      if (!evidence.release.ok) {
        evidence.ok = false;
        failure = failure || Error('Recovery lock release was not verified');
        evidence.error = evidence.error || String(failure.stack || failure);
      }
      evidence.finishedAt = new Date().toISOString();
      try { save(); } catch (error) { failure = failure || error; }
    }
    if (failure) throw failure;
    return evidence;
  }
  return { inspectOwner, acquireRecovery, recover };
}
module.exports = { createNativeRecovery };
