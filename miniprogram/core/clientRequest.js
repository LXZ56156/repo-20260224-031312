function buildClientRequestId(prefix = 'write') {
  const head = String(prefix || 'write').trim() || 'write';
  return `${head}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveClientRequestId(value, prefix = 'write') {
  const existing = String(value || '').trim();
  return existing || buildClientRequestId(prefix);
}

module.exports = {
  buildClientRequestId,
  resolveClientRequestId
};
