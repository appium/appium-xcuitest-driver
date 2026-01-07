import {parseLocalizableStrings} from '../app-utils';
import type {XCUITestDriver} from '../driver';
import type {StringRecord} from '@appium/types';

/**
 * Return the language-specific strings for an app
 *
 * @param language - The language abbreviation to fetch app strings mapping for.
 * If no language is provided then strings for the 'en language would be returned
 * @param stringFile - Relative path to the corresponding .strings
 * file starting from the corresponding .lproj folder, e.g., `base/main.strings`. If omitted,
 * then Appium will make its best guess where the file is.
 *
 * @returns A record of localized keys to localized text
 */
export async function getStrings(
  this: XCUITestDriver,
  language: string,
  stringFile: string | null = null,
): Promise<StringRecord<string>> {
  this.log.debug(`Gettings strings for language '${language}' and string file '${stringFile}'`);
  return await parseLocalizableStrings.bind(this)(
    {
      ...this.opts,
      language,
      stringFile,
      strictMode: true,
    },
  );
}

