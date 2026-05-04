import {fs} from 'appium/support';
import _ from 'lodash';
import os from 'node:os';
import path from 'node:path';
import {exec} from 'teen_process';
import {log} from '../logger';

const XCTEST_LOG_FILES_PATTERNS = [
  /^Session-WebDriverAgentRunner.*\.log$/i,
  /^StandardOutputAndStandardError\.txt$/i,
];
const XCTEST_LOGS_CACHE_FOLDER_PREFIX = 'com.apple.dt.XCTest';

// This map contains derived data logs folders as keys
// and values are the count of times the particular
// folder has been scheduled for removal
const derivedDataCleanupMarkers = new Map<string, number>();

/** Deletes the provided filesystem locations, logging reclaimed size when available. */
export async function clearLogs(locations: string[]): Promise<void> {
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

/** Marks WDA logs folder for deferred cleanup across parallel sessions. */
export async function markSystemFilesForCleanup(wda: any): Promise<void> {
  if (!wda || !(await wda.retrieveDerivedDataPath())) {
    log.warn(
      'No WebDriverAgent derived data available, so unable to mark system files for cleanup',
    );
    return;
  }

  const logsRoot = path.resolve(await wda.retrieveDerivedDataPath(), 'Logs');
  let markersCount = 0;
  const existingCount = derivedDataCleanupMarkers.get(logsRoot);
  if (existingCount !== undefined) {
    markersCount = existingCount;
  }
  derivedDataCleanupMarkers.set(logsRoot, ++markersCount);
}

/** Cleans per-session WDA logs and stale XCTest temporary logs. */
export async function clearSystemFiles(wda: any): Promise<void> {
  // only want to clear the system files for the particular WDA xcode run
  if (!wda || !(await wda.retrieveDerivedDataPath())) {
    log.warn('No WebDriverAgent derived data available, so unable to clear system files');
    return;
  }

  const logsRoot = path.resolve(await wda.retrieveDerivedDataPath(), 'Logs');
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
    // perform the cleanup asynchronously
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
