import path from 'node:path';
import {isEmpty} from '../../utils';
import {fs, tempDir, zip} from 'appium/support';
import {log} from '../../logger';
import {spawn} from 'node:child_process';
import type {StringRecord} from '@appium/types';
import type {Readable} from 'node:stream';

export const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const SAFARI_OPTS_ALIASES_MAP = {
  safariAllowPopups: [
    ['WebKitJavaScriptCanOpenWindowsAutomatically', 'JavaScriptCanOpenWindowsAutomatically'],
    (x: boolean) => Number(Boolean(x)),
  ],
  safariIgnoreFraudWarning: [['WarnAboutFraudulentWebsites'], (x: boolean) => Number(!x)],
  safariOpenLinksInBackground: [['OpenLinksInBackground'], (x: boolean) => Number(Boolean(x))],
} as const;
const MACOS_RESOURCE_FOLDER = '__MACOSX';

export interface UnzipInfo {
  rootDir: string;
  archiveSize: number;
}

/**
 * Unzips a ZIP archive on the local file system.
 *
 * @param archivePath Full path to a .zip archive
 * @returns Temporary folder root where the archive has been extracted
 */
export async function unzipFile(archivePath: string): Promise<UnzipInfo> {
  const useSystemUnzipEnv = process.env.APPIUM_PREFER_SYSTEM_UNZIP;
  const useSystemUnzip =
    isEmpty(useSystemUnzipEnv) ||
    !['0', 'false'].includes(String(useSystemUnzipEnv).toLowerCase());
  const tmpRoot = await tempDir.openDir();
  try {
    await zip.extractAllTo(archivePath, tmpRoot, {
      useSystemUnzip,
      // https://github.com/appium/appium/issues/14100
      fileNamesEncoding: 'utf8',
    });
  } catch (e) {
    await fs.rimraf(tmpRoot);
    throw e;
  }
  return {
    rootDir: tmpRoot,
    archiveSize: (await fs.stat(archivePath)).size,
  };
}

/**
 * Unzips a ZIP archive from a stream.
 * Uses bdstar tool for this purpose.
 * This allows to optimize the time needed to prepare the app under test
 * to MAX(download, unzip) instead of SUM(download, unzip)
 */
export async function unzipStream(zipStream: Readable): Promise<UnzipInfo> {
  const tmpRoot = await tempDir.openDir();
  const bsdtarProcess = spawn(
    await fs.which('bsdtar'),
    ['-x', '--exclude', MACOS_RESOURCE_FOLDER, '--exclude', `${MACOS_RESOURCE_FOLDER}/*`, '-'],
    {
      cwd: tmpRoot,
    },
  );
  let archiveSize = 0;
  bsdtarProcess.stderr.on('data', (chunk) => {
    const stderr = chunk.toString();
    if (stderr.trim()) {
      log.warn(stderr);
    }
  });
  bsdtarProcess.stdin.on('error', (e) => {
    log.warn(`Error occurred while writing to bsdtar stdin: ${e.message}`);
  });
  zipStream.on('data', (chunk) => {
    archiveSize += chunk.length;
  });
  zipStream.pipe(bsdtarProcess.stdin);
  try {
    await new Promise<void>((resolve, reject) => {
      zipStream.once('error', reject);
      bsdtarProcess.once('exit', (code, signal) => {
        zipStream.unpipe(bsdtarProcess.stdin);
        log.debug(`bsdtar process exited with code ${code}, signal ${signal}`);
        if (code === 0) {
          resolve(undefined);
        } else {
          reject(new Error('Is it a valid ZIP archive?'));
        }
      });
      bsdtarProcess.once('error', (e) => {
        zipStream.unpipe(bsdtarProcess.stdin);
        reject(e);
      });
    });
  } catch (err: any) {
    bsdtarProcess.kill(9);
    await fs.rimraf(tmpRoot);
    throw new Error(`The response data cannot be unzipped: ${err.message}`, {cause: err});
  } finally {
    bsdtarProcess.removeAllListeners();
    zipStream.removeAllListeners();
  }
  return {
    rootDir: tmpRoot,
    archiveSize,
  };
}

/**
 * Builds Safari preferences object based on the given session capabilities
 *
 * @param opts
 * @return
 */
export function buildSafariPreferences(opts: StringRecord): StringRecord {
  const safariSettings = structuredClone(opts?.safariGlobalPreferences ?? {});

  for (const [name, [aliases, valueConverter]] of Object.entries(SAFARI_OPTS_ALIASES_MAP)) {
    if (!Object.hasOwn(opts, name)) {
      continue;
    }

    for (const alias of aliases) {
      safariSettings[alias] = valueConverter((opts as any)[name]);
    }
  }
  return safariSettings;
}

/**
 * Looks for items with given extensions in the given folder.
 *
 * @param appPath Full path to an app bundle
 * @param appExtensions List of matching item extensions
 * @returns List of relative paths to matched items
 */
export async function findApps(appPath: string, appExtensions: string[]): Promise<string[]> {
  const globPattern = `**/*.+(${appExtensions.map((ext) => ext.replace(/^\./, '')).join('|')})`;
  const sortedBundleItems = (
    await fs.glob(globPattern, {
      cwd: appPath,
    })
  ).sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  return sortedBundleItems;
}
