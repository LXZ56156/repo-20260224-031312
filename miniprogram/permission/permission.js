function isAdmin(tournament, openid) {
  return tournament && openid && tournament.creatorId === openid;
}

function isReferee(tournament, openid) {
  return tournament && openid && tournament.refereeId === openid;
}

function canEditScore(tournament, openid) {
  return isAdmin(tournament, openid) || isReferee(tournament, openid);
}

module.exports = { isAdmin, isReferee, canEditScore };
