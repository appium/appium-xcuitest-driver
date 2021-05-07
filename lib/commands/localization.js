const commands = {};


/**
 * @typedef {Object} KeyboardOptions
 * @property {!string} name The name of the keyboard locale, for example `en_US` or `de_CH`
 * @property {!string} layout The keyboard layout, for example `QUERTY` or `Ukrainian`
 * @property {?string} hardware Could either be `Automatic` or `null`
 */

/**
 * @typedef {Object} LanguageOptions
 * @property {!string} name The name of the language, for example `de` or `zh-Hant-CN`
 */

/**
 * @typedef {Object} LocaleOptions
 * @property {!string} name The name of the system locale, for example `de_CH` or `zh_CN`
 * @property {?string} calendar Optional calendar format, for example `gregorian` or `persian`
 */

/**
 * @typedef {Object} LocalizationOptions
 * @property {?KeyboardOptions} keyboard
 * @property {?LanguageOptions} language
 * @property {?LocaleOptions} locale
 */

/**
 * Change localization settings on the currently booted simulator
 *
 * @param {?LocalizationOptions} opts
 * @throws {Error} If there was a failure while setting the preferences
 * @returns {boolean} `true` if any of settings has been successfully changed
 */
commands.mobileConfigureLocalization = async function mobileConfigureLocalization (opts = {}) {
  if (!this.isSimulator()) {
    throw new Error('This extension is only available for Simulator');
  }

  const { language, locale, keyboard } = opts;
  return await this.opts.device.configureLocalization({language, locale, keyboard});
};

export { commands };
export default commands;
