import {fs} from 'appium/support';
import _ from 'lodash';
import os from 'node:os';
import path from 'node:path';
import {exec} from 'teen_process';
import type {XCUITestDriver} from '../../driver';
import {log} from '../../logger';
import {isXcodebuildNeeded, SHARED_RESOURCES_GUARD, XCUITEST_DRIVER_SYNC_NAME} from './constants';

const XCTEST_LOG_FILES_PATTERNS = [
  /^Session-WebDriverAgentRunner.*\.log$/i,
  /^StandardOutputAndStandardError\.txt$/i,
];
const XCTEST_LOGS_CACHE_FOLDER_PREFIX = 'com.apple.dt.XCTest';

// This map contains derived data logs folders as keys
// and values are the count of times the particular
// folder has been scheduled for removal
const derivedDataCleanupMarkers = new Map<string, number>();

export type RetrieveDerivedDataPath = () => Promise<string | undefined>;

/** Marks WDA logs folder for deferred cleanup across parallel sessions. */
export async function markSystemFilesForCleanup(
  retrieveDerivedDataPath: RetrieveDerivedDataPath,
): Promise<void> {
  const derivedDataPath = await retrieveDerivedDataPath();
  if (!derivedDataPath) {
    log.warn(
      'No WebDriverAgent derived data available, so unable to mark system files for cleanup',
    );
    return;
  }

  const logsRoot = path.resolve(derivedDataPath, 'Logs');
  const markersCount = derivedDataCleanupMarkers.get(logsRoot) ?? 0;
  derivedDataCleanupMarkers.set(logsRoot, markersCount + 1);
}

/** Cleans per-session WDA logs and stale XCTest temporary logs. */
export async function clearSystemFiles(
  retrieveDerivedDataPath: RetrieveDerivedDataPath,
): Promise<void> {
  const derivedDataPath = await retrieveDerivedDataPath();
  if (!derivedDataPath) {
    log.warn('No WebDriverAgent derived data available, so unable to clear system files');
    return;
  }

  const logsRoot = path.resolve(derivedDataPath, 'Logs');
  const existingCount = derivedDataCleanupMarkers.get(logsRoot);
  if (existingCount !== undefined) {
    let markersCount = existingCount;
    derivedDataCleanupMarkers.set(logsRoot, --markersCount);
    if (markersCount > 0) {
      log.info(
        `Not cleaning '${logsRoot}' folder, because the other session does not expect it to be cleaned`,
      );
      return;
    }
  }
  derivedDataCleanupMarkers.set(logsRoot, 0);

  // Cleaning up big temporary files created by XCTest: https://github.com/appium/appium/issues/9410
  const globPattern = `${os.tmpdir()}/${XCTEST_LOGS_CACHE_FOLDER_PREFIX}*/`;
  const dstFolders = await fs.glob(globPattern);
  if (_.isEmpty(dstFolders)) {
    log.debug(`Did not find the temporary XCTest logs root at '${globPattern}'`);
  } else {
    const promises: Promise<void>[] = [];
    for (const dstFolder of dstFolders) {
      const promise = (async () => {
        const deletionPromises: Promise<void>[] = [];
        try {
          await fs.walkDir(dstFolder, true, (itemPath, isDir) => {
            if (isDir) {
              return;
            }
            const fileName = path.basename(itemPath);
            if (XCTEST_LOG_FILES_PATTERNS.some((p) => p.test(fileName))) {
              deletionPromises.push(fs.rimraf(itemPath));
            }
          });
          if (deletionPromises.length) {
            await Promise.all(deletionPromises);
          }
        } catch (e: any) {
          log.debug(e.stack);
          log.info(e.message);
        }
      })();
      promises.push(promise);
    }
    log.debug(`Started XCTest logs cleanup in '${dstFolders}'`);
    if (promises.length) {
      await Promise.all(promises);
    }
  }

  if (await fs.exists(logsRoot)) {
    log.info(`Cleaning test logs in '${logsRoot}' folder`);
    await clearLogs([logsRoot]);
    return;
  }
  log.info(`There is no ${logsRoot} folder, so not cleaning files`);
}

/**
 * Clears WebDriverAgent system files after session teardown when enabled via capability.
 */
export async function cleanup(driver: XCUITestDriver): Promise<void> {
  if (!driver._wda || !isXcodebuildNeeded(driver.opts)) {
    return;
  }

  if (!driver.opts.clearSystemFiles) {
    driver.log.debug('Not clearing log files. Use `clearSystemFiles` capability to turn on.');
    return;
  }

  let synchronizationKey = XCUITEST_DRIVER_SYNC_NAME;
  const derivedDataPath = await driver.wda.retrieveDerivedDataPath();
  if (derivedDataPath) {
    synchronizationKey = path.normalize(derivedDataPath);
  }
  await SHARED_RESOURCES_GUARD.acquire(synchronizationKey, async () => {
    await clearSystemFiles(() => driver.wda.retrieveDerivedDataPath());
  });
}

/** Deletes the provided filesystem locations, logging reclaimed size when available. */
async function clearLogs(locations: string[]): Promise<void> {
  log.debug('Clearing log files');
  const cleanupPromises: Promise<void>[] = [];
  for (const location of locations) {
    if (!(await fs.exists(location))) {
      continue;
    }

    cleanupPromises.push(
      (async () => {
        let size: string | undefined;
        try {
          const {stdout} = await exec('du', ['-sh', location]);
          size = stdout.trim().split(/\s+/)[0];
        } catch {}
        try {
          log.debug(`Deleting '${location}'. ${size ? `Freeing ${size}.` : ''}`);
          await fs.rimraf(location);
        } catch (err: any) {
          log.warn(`Unable to delete '${location}': ${err.message}`);
        }
      })(),
    );
  }
  if (!_.isEmpty(cleanupPromises)) {
    await Promise.all(cleanupPromises);
  }
  log.debug('Finished clearing log files');
}
