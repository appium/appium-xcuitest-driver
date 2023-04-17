import {parseLocalizableStrings} from '../app-utils';

export default {
  /**
   * Return the language-specific strings for an app
   *
   * @param {string} language - the language to retrieve strings for
   * @param {string|null} stringFile - the path to the localized strings file if not in the default location
   *
   * @returns A record of localized keys to localized text
   *
   * @this {XCUITestDriver}
   */
  async getStrings(language, stringFile = null) {
    this.log.debug(`Gettings strings for language '${language}' and string file '${stringFile}'`);
    return await parseLocalizableStrings(
      Object.assign({}, this.opts, {
        language,
        stringFile,
        strictMode: true,
      })
    );
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
