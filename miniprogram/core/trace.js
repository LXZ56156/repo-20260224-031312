function createTraceId(prefix = 'op') {
  const tag = String(prefix || 'op').trim() || 'op';
  return `${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  createTraceId
};
