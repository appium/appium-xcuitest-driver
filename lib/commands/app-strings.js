import {parseLocalizableStrings} from '../app-utils';

export default {
  /**
   * Return the language-specific strings for an app
   *
   * @param {string} language - The language abbreviation to fetch app strings mapping for.
   * If no language is provided then strings for the 'en language would be returned
   * @param {string|null} [stringFile=null] - Relative path to the corresponding .strings
   * file starting from the corresponding .lproj folder, e.g., `base/main.strings`. If omitted,
   * then Appium will make its best guess where the file is.
   *
   * @returns {Promise<import('@appium/types').StringRecord<string>>} A record of localized keys to localized text
   *
   * @this {XCUITestDriver}
   */
  async getStrings(language, stringFile = null) {
    this.log.debug(`Gettings strings for language '${language}' and string file '${stringFile}'`);
    return await parseLocalizableStrings.bind(this)(
      Object.assign({}, this.opts, {
        language,
        stringFile,
        strictMode: true,
      }),
    );
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
