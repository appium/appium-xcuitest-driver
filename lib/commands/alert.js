const commands = {};

function toAlertParams (opts = {}) {
  const params = {};
  if (opts.buttonLabel) {
    params.name = opts.buttonLabel;
  }
  return params;
}

commands.getAlertText = async function getAlertText () {
  return await this.proxyCommand('/alert/text', 'GET');
};

commands.setAlertText = async function setAlertText (value) {
  return await this.proxyCommand('/alert/text', 'POST', {value});
};

commands.postAcceptAlert = async function postAcceptAlert (opts = {}) {
  return await this.proxyCommand('/alert/accept', 'POST', toAlertParams(opts));
};

commands.postDismissAlert = async function postDismissAlert (opts = {}) {
  return await this.proxyCommand('/alert/dismiss', 'POST', toAlertParams(opts));
};

commands.getAlertButtons = async function getAlertButtons () {
  return await this.proxyCommand('/wda/alert/buttons', 'GET');
};

commands.mobileHandleAlert = async function mobileHandleAlert (opts = {}) {
  switch (opts.action) {
    case 'accept':
      return await this.postAcceptAlert(opts);
    case 'dismiss':
      return await this.postDismissAlert(opts);
    case 'getButtons':
      return await this.getAlertButtons();
    default:
      throw new Error(`The 'action' value should be either 'accept', 'dismiss' or 'getButtons'. ` +
                      `'${opts.action}' is provided instead.`);
  }
};

export { commands };
export default commands;
