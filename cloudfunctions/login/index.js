const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const common = require('./lib/common');

exports.main = async () => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext();
  return common.okResult('LOGIN_OK', '登录成功', {
    state: 'ready',
    openid: OPENID,
    appid: APPID,
    unionid: UNIONID || ''
  });
};
