const base = require('./storage/base');
const profile = require('./storage/profile');
const tournament = require('./storage/tournament');
const prefs = require('./storage/prefs');
const scoreDraft = require('./storage/scoreDraft');
const adState = require('./storage/adState');

module.exports = {
  ...base,
  ...profile,
  ...tournament,
  ...prefs,
  ...scoreDraft,
  ...adState
};
