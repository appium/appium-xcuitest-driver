import {fs} from 'appium/support';
import {memoize} from '../../utils';
import path from 'node:path';
import {exec} from 'teen_process';
import {log} from '../../logger';

const MODULE_NAME = 'appium-xcuitest-driver';

export interface DriverInfo {
  version: string;
  built: string;
}

const getModuleManifest = memoize(async function getModuleManifest(): Promise<Record<string, any>> {
  let currentDir = path.resolve(__dirname);
  let isAtFsRoot = false;
  while (!isAtFsRoot) {
    const manifestPath = path.join(currentDir, 'package.json');
    try {
      if (await fs.exists(manifestPath)) {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        if (manifest.name === MODULE_NAME) {
          return manifest;
        }
      }
    } catch {}
    const parentDir = path.dirname(currentDir);
    isAtFsRoot = currentDir.length <= parentDir.length;
    currentDir = parentDir;
  }
  throw new Error(`Cannot find the package manifest of the ${MODULE_NAME} Node.js module`);
});

/** Gets driver build/version metadata from package manifest. */
export const getDriverInfo = memoize(async function getDriverInfo(): Promise<DriverInfo> {
  const [stat, manifest] = await Promise.all([
    fs.stat(path.resolve(__dirname, '../..')),
    getModuleManifest(),
  ]);
  return {
    built: stat.mtime.toString(),
    version: manifest.version,
  };
});

/** Logs effective OS user running the current process. */
export async function printUser(): Promise<void> {
  try {
    const {stdout} = await exec('whoami');
    log.debug(`Current user: '${stdout.trim()}'`);
  } catch (err: any) {
    log.debug(`Unable to get username running server: ${err.message}`);
  }
}
