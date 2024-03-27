import _ from 'lodash';
import {assertSimulator as _assertSimulator} from '../utils';

const assertSimulator = _.partial(_assertSimulator, 'Localization configuration');

export default {
  /**
   * Change localization settings on the currently booted simulator
   *
   * The changed settings are only applied for _newly started_ applications and activities.
   * Currently running applications will be unchanged. This means, for example, that the keyboard should be hidden and shown again in order to observe the changed layout, and curresponding apps must be restarted in order to observe their interface using the newly set locale/language.
   *
   * The driver performs no strict checking of the arguments (such as locale names). Be aware that an incorrect or invalid string may cause unexpected behavior.
   * @param {import('./types').KeyboardOptions} [keyboard] - Keyboard options
   * @param {import('./types').LanguageOptions} [language] - Language options
   * @param {import('./types').LocaleOptions} [locale] - Locale options
   * @throws {Error} If there was a failure while setting the preferences
   * @returns {Promise<boolean>} `true` if any of settings has been successfully changed
   * @group Simulator Only
   * @this {import('../driver').XCUITestDriver}
   */
  async mobileConfigureLocalization(keyboard, language, locale) {
    assertSimulator(this);

    const localizationOptions = {locale, keyboard};
    if (language) {
      // Assign skipSyncUiDialogTranslation: true option in order to avoid shutting down the WDA session
      localizationOptions.language = Object.assign(language, {skipSyncUiDialogTranslation: true});
    }
    return await /** @type {import('../driver').Simulator} */ (this.device).configureLocalization(localizationOptions);
  },
};
