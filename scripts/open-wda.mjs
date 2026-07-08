import path from 'node:path';

import {BOOTSTRAP_PATH} from 'appium-webdriveragent';
import {logger} from 'appium/support.js';
import {exec} from 'teen_process';

const log = logger.getLogger('WDA');
const XCODEPROJ_NAME = 'WebDriverAgent.xcodeproj';

async function openWda() {
  const dstPath = path.resolve(BOOTSTRAP_PATH, XCODEPROJ_NAME);
  log.info(`Opening '${dstPath}'`);
  await exec('open', [dstPath]);
}

(async () => await openWda())();
