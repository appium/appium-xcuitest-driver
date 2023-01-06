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
   * @this {XCUITestDriver}
   */
  async setAlertText(value) {
    return await this.proxyCommand('/alert/text', 'POST', {value});
  },
  /**
   * @this {XCUITestDriver}
   */
  async postAcceptAlert(opts = {}) {
    return await this.proxyCommand('/alert/accept', 'POST', toAlertParams(opts));
  },
  /**
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
   * @this {XCUITestDriver}
   */
  async mobileHandleAlert(opts = {}) {
    switch (opts.action) {
      case 'accept':
        return await this.postAcceptAlert(opts);
      case 'dismiss':
        return await this.postDismissAlert(opts);
      case 'getButtons':
        return await this.getAlertButtons();
      default:
        throw new Error(
          `The 'action' value should be either 'accept', 'dismiss' or 'getButtons'. ` +
            `'${opts.action}' is provided instead.`
        );
    }
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
