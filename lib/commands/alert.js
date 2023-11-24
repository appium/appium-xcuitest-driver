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
    return /** @type {string|null} */ (await this.proxyCommand('/alert/text', 'GET'));
  },
  /**
   * @param {string} value
   * @this {XCUITestDriver}
   * @returns {Promise<void>}
   */
  async setAlertText(value) {
    await this.proxyCommand('/alert/text', 'POST', {value});
  },
  /**
   * @param { {buttonLabel?: string} } opts
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   */
  async postAcceptAlert(opts = {}) {
    await this.proxyCommand('/alert/accept', 'POST', toAlertParams(opts));
  },
  /**
   * @param { {buttonLabel?: string} } opts
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   */
  async postDismissAlert(opts = {}) {
    await this.proxyCommand('/alert/dismiss', 'POST', toAlertParams(opts));
  },
  /**
   * @internal
   * @this {XCUITestDriver}
   * @returns {Promise<string[]>} The list of button labels
   */
  async getAlertButtons() {
    return /** @type {string[]} */ (await this.proxyCommand('/wda/alert/buttons', 'GET'));
  },
  /**
   * Tries to apply the given action to the currently visible alert.
   *
   * @param {AlertAction} action - The actual action to apply.
   * @param {string} [buttonLabel] - The name of the button used to perform the chosen alert action. Only makes sense if the action is `accept` or `dismiss`.
   * @returns {Promise<string[]|void>} If `action` is `getButtons`, a list of alert button labelsp; otherwise nothing.
   * @remarks This should really be separate commands.
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
            `'${action}' is provided instead.`,
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
