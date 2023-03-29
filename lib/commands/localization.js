
/**
 * @typedef {Object} KeyboardOptions
 * @property {string} name The name of the keyboard locale, for example `en_US` or `de_CH`
 * @property {string} layout The keyboard layout, for example `QUERTY` or `Ukrainian`
 * @property {'Automatic'?} [hardware] Could either be `Automatic` or `null`
 * @privateRemarks Should `hardware` allow `undefined`? Because here it does.
 */

/**
 * @typedef {Object} LanguageOptions
 * @property {string} name The name of the language, for example `de` or `zh-Hant-CN`
 */

/**
 * @typedef {Object} LocaleOptions
 * @property {string} name The name of the system locale, for example `de_CH` or `zh_CN`
 * @property {string} [calendar] Optional calendar format, for example `gregorian` or `persian`
 */

export default {
  /**
   * Change localization settings on the currently booted simulator
   *
   * @param {KeyboardOptions} [keyboard] - Keyboard options
   * @param {LanguageOptions} [language] - Language options
   * @param {LocaleOptions} [locale] - Locale options
   * @throws {Error} If there was a failure while setting the preferences
   * @returns {Promise<boolean>} `true` if any of settings has been successfully changed
   * @group Simulator Only
   * @this {import('../driver').XCUITestDriver}
   */
  async mobileConfigureLocalization(keyboard, language, locale) {
    if (!this.isSimulator()) {
      throw new Error('This extension is only available for Simulator');
    }

    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    return await this.opts.device.configureLocalization({language, locale, keyboard});
  },
};
