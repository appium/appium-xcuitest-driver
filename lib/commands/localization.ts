import {assertSimulator} from '../utils';
import type {XCUITestDriver} from '../driver';
import type {KeyboardOptions, LanguageOptions, LocaleOptions} from './types';

/**
 * Change localization settings on the currently booted simulator
 *
 * The changed settings are only applied for _newly started_ applications and activities.
 * Currently running applications will be unchanged. This means, for example, that the keyboard should be hidden and shown again in order to observe the changed layout, and corresponding apps must be restarted in order to observe their interface using the newly set locale/language.
 *
 * The driver performs no strict checking of the arguments (such as locale names). Be aware that an incorrect or invalid string may cause unexpected behavior.
 * @param keyboard - Keyboard options
 * @param language - Language options
 * @param locale - Locale options
 * @throws {Error} If there was a failure while setting the preferences
 * @returns `true` if any of settings has been successfully changed
 * @group Simulator Only
 */
export async function mobileConfigureLocalization(
  this: XCUITestDriver,
  keyboard?: KeyboardOptions,
  language?: LanguageOptions,
  locale?: LocaleOptions,
): Promise<boolean> {
  ;

  const localizationOptions: {
    locale?: LocaleOptions;
    keyboard?: KeyboardOptions;
    language?: LanguageOptions & {skipSyncUiDialogTranslation?: boolean};
  } = {locale, keyboard};
  if (language) {
    // Assign skipSyncUiDialogTranslation: true option in order to avoid shutting down the WDA session
    localizationOptions.language = Object.assign(language, {skipSyncUiDialogTranslation: true});
  }
  return await assertSimulator.call(this, 'Localization configuration')
    .configureLocalization(localizationOptions);
}

