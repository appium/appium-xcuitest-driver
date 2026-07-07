import path from 'node:path';

import type {StringRecord} from '@appium/types';
import {plist, fs, util, tempDir, zip} from 'appium/support';

import type {XCUITestDriver} from '../driver';
import {isEmpty, mergeDeep} from '../utils';
import {APP_EXT} from './constants';
import {findApps} from './helpers';

const STRINGSDICT_RESOURCE = '.stringsdict';
const STRINGS_RESOURCE = '.strings';

export interface LocalizableStringsOptions {
  app?: string;
  language?: string;
  localizableStringsDir?: string;
  stringFile?: string;
  strictMode?: boolean;
}

/**
 * Extracts string resources from an app
 */
export async function parseLocalizableStrings(
  this: XCUITestDriver,
  opts: LocalizableStringsOptions = {},
): Promise<StringRecord> {
  const {app, language = 'en', localizableStringsDir, stringFile, strictMode} = opts;
  if (!app) {
    const message = `Strings extraction is not supported if 'app' capability is not set`;
    if (strictMode) {
      throw new Error(message);
    }
    this.log.info(message);
    return {};
  }

  let bundleRoot = app;
  const isArchive = (await fs.stat(app)).isFile();
  let tmpRoot: string | undefined;
  try {
    if (isArchive) {
      tmpRoot = await tempDir.openDir();
      this.log.info(`Extracting '${app}' into a temporary location to parse its resources`);
      await zip.extractAllTo(app, tmpRoot);
      const relativeBundleRoot = (await findApps(tmpRoot, [APP_EXT]))[0] as string;
      this.log.info(`Selecting '${relativeBundleRoot}'`);
      bundleRoot = path.join(tmpRoot, relativeBundleRoot);
    }

    let lprojRoot: string | undefined;
    for (const subfolder of [`${language}.lproj`, localizableStringsDir, ''].filter(
      (x): x is string => typeof x === 'string',
    )) {
      lprojRoot = path.resolve(bundleRoot, subfolder as string);
      if (await fs.exists(lprojRoot)) {
        break;
      }
      const message = `No '${lprojRoot}' resources folder has been found`;
      if (strictMode) {
        throw new Error(message);
      }
      this.log.debug(message);
    }
    if (!lprojRoot) {
      return {};
    }

    this.log.info(`Retrieving resource strings from '${lprojRoot}'`);
    const resourcePaths: string[] = [];
    if (stringFile) {
      const dstPath = path.resolve(lprojRoot, stringFile);
      if (await fs.exists(dstPath)) {
        resourcePaths.push(dstPath);
      } else {
        const message = `No '${dstPath}' resource file has been found for '${app}'`;
        if (strictMode) {
          throw new Error(message);
        }
        this.log.info(message);
      }
    }

    if (isEmpty(resourcePaths) && lprojRoot && (await fs.exists(lprojRoot))) {
      const resourceFiles = (await fs.readdir(lprojRoot))
        .filter((name) => [STRINGS_RESOURCE, STRINGSDICT_RESOURCE].some((x) => name.endsWith(x)))
        .map((name) => path.resolve(lprojRoot, name));
      resourcePaths.push(...resourceFiles);
    }
    this.log.info(
      `Got ${util.pluralize('resource file', resourcePaths.length, true)} in '${lprojRoot}'`,
    );

    if (isEmpty(resourcePaths)) {
      return {};
    }

    const resultStrings: StringRecord = {};
    const toAbsolutePath = (p: string) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));
    for (const resourcePath of resourcePaths) {
      if (!util.isSubPath(toAbsolutePath(resourcePath), toAbsolutePath(bundleRoot))) {
        throw new Error(`'${resourcePath}' is expected to be located under '${bundleRoot}'`);
      }
      try {
        const data = await readResource(resourcePath);
        this.log.debug(
          `Parsed ${util.pluralize('string', Object.keys(data).length, true)} from '${resourcePath}'`,
        );
        mergeDeep(resultStrings, data);
      } catch (e: any) {
        this.log.warn(`Cannot parse '${resourcePath}' resource. Original error: ${e.message}`);
      }
    }

    this.log.info(
      `Retrieved ${util.pluralize('string', Object.keys(resultStrings).length, true)} from '${lprojRoot}'`,
    );
    return resultStrings;
  } finally {
    if (tmpRoot) {
      await fs.rimraf(tmpRoot);
    }
  }
}

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
  return await parseLocalizableStrings.bind(this)({
    ...this.opts,
    language,
    stringFile,
    strictMode: true,
  });
}

async function readResource(resourcePath: string): Promise<StringRecord> {
  const data = await plist.parsePlistFile(resourcePath);
  return Object.entries(data).reduce((result, [key, value]) => {
    result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    return result;
  }, {} as StringRecord);
}
