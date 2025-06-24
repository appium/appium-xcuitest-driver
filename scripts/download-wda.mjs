#!/usr/bin/env node

import {fs, zip} from '@appium/support';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import https from 'https';

const DEST_ZIP = 'WebDriverAgentRunner-Build-Sim-arm64.zip';
const DEST_DIR = 'wda';
const WDA_URL = (version) => `https://github.com/appium/WebDriverAgent/releases/download/v${version}/${DEST_ZIP}`;

async function webdriveragentPkgVersion() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const pkgPath = path.join(__dirname, '../node_modules/appium-webdriveragent/package.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  return pkg.version;
};

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
}

(async () => {
  const wdaVersion = '9.14.6'; // await webdriveragentPkgVersion();
  await downloadFile(WDA_URL(wdaVersion), DEST_ZIP);
  await unzipFile(DEST_ZIP, path.resolve(DEST_DIR));
})();
