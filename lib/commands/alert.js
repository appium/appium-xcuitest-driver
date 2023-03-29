/**
 *
 * @param { {buttonLabel?: string} } opts
 * @returns { {name?: string} }
 */
function toAlertParams(opts = {}) {
  const params = {};
  if (opts.buttonLabel) {
    params.name = opts.buttonLabel;
  }
  return params;
}

export default {
  /**
   * @this {XCUITestDriver}
   */
  async getAlertText() {
    return await this.proxyCommand('/alert/text', 'GET');
  },
  /**
   * @param {string} value
   * @this {XCUITestDriver}
   */
  async setAlertText(value) {
    return await this.proxyCommand('/alert/text', 'POST', {value});
  },
  /**
   * @param { {buttonLabel?: string} } opts
   * @this {XCUITestDriver}
   */
  async postAcceptAlert(opts = {}) {
    return await this.proxyCommand('/alert/accept', 'POST', toAlertParams(opts));
  },
  /**
   * @param { {buttonLabel?: string} } opts
   * @this {XCUITestDriver}
   */
  async postDismissAlert(opts = {}) {
    return await this.proxyCommand('/alert/dismiss', 'POST', toAlertParams(opts));
  },
  /**
   * @this {XCUITestDriver}
   */
  async getAlertButtons() {
    return await this.proxyCommand('/wda/alert/buttons', 'GET');
  },
  /**
   * @param {AlertAction} action
   * @param {string} [buttonLabel]
   * @this {XCUITestDriver}
   */
  async mobileHandleAlert(action, buttonLabel) {
    switch (action) {
      case 'accept':
        return await this.postAcceptAlert({buttonLabel});
      case 'dismiss':
        return await this.postDismissAlert({buttonLabel});
      case 'getButtons':
        return await this.getAlertButtons();
      default:
        throw new Error(
          `The 'action' value should be either 'accept', 'dismiss' or 'getButtons'. ` +
            `'${action}' is provided instead.`
        );
    }
  },
};

/**
 * @typedef {'accept'|'dismiss'|'getButtons'} AlertAction
 */

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
