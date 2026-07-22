import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {fs, node} from 'appium/support.js';

import {log} from '../../logger.js';
import {memoize} from '../../utils/index.js';

const MODULE_NAME = 'appium-xcuitest-driver';

export interface DriverInfo {
  version: string;
  built: string;
}

/** Gets driver build/version metadata from package manifest. */
export const getDriverInfo = memoize(async function getDriverInfo(): Promise<DriverInfo> {
  const moduleRoot = node.getModuleRootSync(MODULE_NAME, fileURLToPath(import.meta.url));
  if (!moduleRoot) {
    throw new Error(`Cannot find the package manifest of ${MODULE_NAME}`);
  }
  const manifestPath = path.join(moduleRoot, 'package.json');
  const [stat, manifestPayload] = await Promise.all([fs.stat(manifestPath), fs.readFile(manifestPath, 'utf8')]);
  return {
    built: stat.mtime.toString(),
    version: JSON.parse(manifestPayload).version,
  };
});

/** Logs effective OS user running the current process. */
export function printUser(): void {
  log.debug(`Current user: '${os.userInfo().username}'`);
}
