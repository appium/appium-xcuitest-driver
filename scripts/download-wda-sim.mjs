import {fs, logger, zip} from '@appium/support';
import http from 'http';
import https from 'https';
import _ from 'lodash';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgValue } from './utils.mjs';

const DEFAULT_DEST_DIR = 'wda';

const log = logger.getLogger('WDA');
const wda_url = (version, zipFileName) =>
  `https://github.com/appium/WebDriverAgent/releases/download/v${version}/${zipFileName}`;
const dest_zip = (platform) => {
  const scheme = `WebDriverAgentRunner${_.toLower(platform) === 'tvos' ? '_tvOS' : ''}`;
  return `${scheme}-Build-Sim-${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}.zip`;
};

/**
 * Return installed appium-webdriveragent package version
 * @returns [number]
 */
async function webdriveragentPkgVersion() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const pkgPath = path.join(__dirname, '../node_modules/appium-webdriveragent/package.json');
  return JSON.parse(await fs.readFile(pkgPath, 'utf8')).version;
};

/**
 * Download a content from the given 'url' into the given 'dest'
 * @param {string} url URL to download content from.
 * @param {string} dest A path to file to store the content to.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    const handleResponse = (response) => {
      // handle redirect
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = response.headers.location.startsWith('http')
          ? response.headers.location
          : new URL(response.headers.location, url).toString();
        protocol.get(redirectUrl, handleResponse).on('error', reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get ${url} because of ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    };
    protocol.get(url, handleResponse).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function unzipFile(zipPath, destDir) {
  await fs.mkdir(destDir, {recursive: true});
  await zip.extractAllTo(zipPath, destDir);
  await fs.unlink(zipPath);
}

(async () => {
  const platform = parseArgValue('platform');
  const destDirPath = parseArgValue('outdir');
  const zipFileName = dest_zip(platform);
  const wdaVersion = await webdriveragentPkgVersion();
  const url_to_download = wda_url(wdaVersion, zipFileName);
  log.info(`Downloading ${url_to_download}`);
  await downloadFile(url_to_download, zipFileName);
  const destination = path.resolve(destDirPath || DEFAULT_DEST_DIR);
  log.info(`Unpacking ${zipFileName} into ${destination}`);
  await unzipFile(zipFileName, destination);
})();
