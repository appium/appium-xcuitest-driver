import _ from 'lodash';
import { fs, plist, tempDir } from 'appium-support';
import { iosCommands } from 'appium-ios-driver';
import { STATIC_DIR } from 'appium-base-driver';
import { openUrl } from 'node-simctl';
import { retryInterval, retry } from 'asyncbox';
import B from 'bluebird';
import log from '../logger';
import os from 'os';
import path from 'path';
import UUID from 'uuid-js';
import { exec } from 'teen_process';

let extensions = {}, commands = {};

const CONFIG_EXTENSION = 'mobileconfig';


async function extractCommonName (certBuffer) {
  const tempCert = await tempDir.open({
    prefix: 'cert',
    suffix: '.cer'
  });
  try {
    await fs.writeFile(tempCert.path, certBuffer);
    const {stdout} = await exec('openssl', ['x509', '-noout', '-subject', '-in', tempCert.path]);
    const cnMatch = /\/CN=([^\/]+)/.exec(stdout); // eslint-disable-line no-useless-escape
    if (cnMatch) {
      return cnMatch[1].trim();
    }
    throw new Error(`There is no common name value in '${stdout}' output`);
  } catch (err) {
    throw new Error(`Cannot parse common name value from the certificate. Is it valid and base64-encoded? ` +
                    `Original error: ${err.message}`);
  } finally {
    await fs.rimraf(tempCert.path);
  }
}

/**
 * Generates Apple's over-the-air configuration profile
 * for certificate deployment based on the given PEM certificate content.
 * Read https://developer.apple.com/library/content/documentation/NetworkingInternet/Conceptual/iPhoneOTAConfiguration/Introduction/Introduction.html
 * for more details on such profiles.
 *
 * @param {Buffer} certBuffer - The actual content of PEM certificate encoded into NodeJS buffer
 * @param {string} commonName - Certificate's common name
 * @returns {Object} The encoded structure of the given certificate, which is ready to be passed
 * as an argument to plist builder
 * @throws {Error} If the given certificate cannot be parsed
 */
function toMobileConfig (certBuffer, commonName) {
  const getUUID = () => UUID.create().hex.toUpperCase();
  const contentUuid = getUUID();
  return {
    PayloadContent: [{
      PayloadCertificateFileName: `${commonName}.cer`,
      PayloadContent: certBuffer,
      PayloadDescription: 'Adds a CA root certificate',
      PayloadDisplayName: commonName,
      PayloadIdentifier: `com.apple.security.root.${contentUuid}`,
      PayloadType: 'com.apple.security.root',
      PayloadUUID: contentUuid,
      PayloadVersion: 1
    }],
    PayloadDisplayName: commonName,
    PayloadIdentifier: `${os.hostname().split('.')[0]}.${getUUID()}`,
    PayloadRemovalDisallowed: false,
    PayloadType: 'Configuration',
    PayloadUUID: getUUID(),
    PayloadVersion: 1
  };
}

async function clickElement (driver, locator, options = {}) {
  let element = null;
  const {
    timeout = 5000,
    skipIfInvisible = false
  } = options;
  const lookupDelay = 500;
  try {
    element = await retryInterval(timeout < lookupDelay ? 1 : timeout / lookupDelay, lookupDelay,
      () => driver.findNativeElementOrElements(locator.type, locator.value, false)
    );
  } catch (err) {
    if (skipIfInvisible) {
      return false;
    }
    throw new Error(`Cannot find ${JSON.stringify(locator)} within ${timeout}ms timeout`);
  }
  await driver.nativeClick(element);
  return true;
}

async function installCertificateInPreferences (driver) {
  // Accept Safari alert
  await clickElement(driver, {
    type: 'accessibility id',
    value: 'Allow',
  }, {
    // certificate load might take some time on slow machines
    timeout: 15000,
  });
  // Wait until Preferences are opened
  await B.delay(2000);

  // Go through Preferences wizard
  if (!await clickElement(driver, {
    type: 'accessibility id',
    value: 'Install'
  }, {
    skipIfInvisible: true,
  })) {
    return false;
  }
  // We need to click Install button on two different tabs
  // The second one confirms the previous
  await B.delay(1500);
  await clickElement(driver, {
    type: 'accessibility id',
    value: 'Install'
  });
  // Accept sheet alert
  await clickElement(driver, {
    type: '-ios class chain',
    value: '**/XCUIElementTypeSheet/**/XCUIElementTypeButton[`label == \'Install\'`]'
  });
  // Finish adding certificate
  await clickElement(driver, {
    type: 'accessibility id',
    value: 'Done'
  });
  return true;
}

async function trustCertificateInPreferences (driver, name) {
  await clickElement(driver, {
    type: 'accessibility id',
    value: 'Return to Settings'
  });
  await clickElement(driver, {
    type: 'accessibility id',
    value: 'General'
  });
  await clickElement(driver, {
    type: 'accessibility id',
    value: 'About'
  });
  const switchLocator = {
    type: '-ios class chain',
    value: `**/XCUIElementTypeCell[\`label == '${name}'\`]/**/XCUIElementTypeSwitch`,
  };
  await retry(5, async () => {
    await driver.mobileSwipe({
      element: await driver.findNativeElementOrElements('class name', 'XCUIElementTypeTable', false),
      direction: 'up'
    });
    await clickElement(driver, {
      type: 'accessibility id',
      value: 'Certificate Trust Settings'
    }, {
      timeout: 500,
    });

    await driver.findNativeElementOrElements(switchLocator.type, switchLocator.value, false);
  });
  // Only click the switch if it is set to Off
  if (await clickElement(driver, {
    type: switchLocator.type,
    value: `${switchLocator.value}[\`value == '0'\`]`
  }, {
    timeout: 1000,
    skipIfInvisible: true,
  })) {
    await driver.postAcceptAlert();
  }
}

/**
 * @typedef {Object} CertificateInstallationOptions
 *
 * @property {!string} content - Base64-encoded content of the public certificate
 * @property {?string} commonName - Common name of the certificate. If this is not set
 *                                  then the script will try to parse it from the given
 *                                  certificate content.
 */

/**
 * Installs a custom certificate onto the device.
 * Since Apple provides no official way to do it via command line,
 * this method tries to wrap the certificate into .mobileconfig format
 * and then deploys the wrapped file to the internal HTTP server,
 * so one can open it with mobile Safari.
 * Then the algorithm goes through the profile installation procedure by
 * clicking the necessary buttons using WebDriverAgent.
 *
 * @param {CertificateInstallationOptions} opts
 * @returns {string} The content of the generated .mobileconfig file as
 * base64-encoded string. This config might be useful for debugging purposes.
 */
commands.mobileInstallCertificate = async function (opts = {}) {
  const {content, commonName} = opts;
  if (_.isEmpty(content)) {
    throw new Error('Certificate content should not be empty');
  }

  if (!await fs.exists(STATIC_DIR)) {
    throw new Error(`The static content root '${STATIC_DIR}' ` +
                    `does not exist or is not accessible`);
  }
  const configName = `${(Math.random() * 0x100000000 + 1).toString(36)}.${CONFIG_EXTENSION}`;
  const configPath = path.resolve(STATIC_DIR, configName);
  const certBuffer = Buffer.from(content, 'base64');
  const cn = commonName || await extractCommonName(certBuffer);
  const mobileConfig = toMobileConfig(certBuffer, cn);
  try {
    await plist.updatePlistFile(configPath, mobileConfig, false, false);
  } catch (err) {
    throw new Error(`Cannot store the generated config as '${configPath}'. ` +
                    `Original error: ${err.message}`);
  }
  try {
    const {address, port} = this.server.address();
    const certUrl = `http://${address ? address : os.hostname()}:${port ? port : 4723}/${configName}`;
    try {
      if (this.isRealDevice()) {
        try {
          await this.proxyCommand('/url', 'POST', {url: certUrl});
        } catch (err) {
          if (this.isWebContext()) {
            // The command above does not always work on real devices
            await iosCommands.general.setUrl.call(this, certUrl);
          } else {
            throw err;
          }
        }
      } else {
        await openUrl(this.opts.udid || this.sim.udid, certUrl);
      }

      if (await installCertificateInPreferences(this)) {
        await trustCertificateInPreferences(this, cn);
      } else {
        log.info(`It looks like the '${cn}' certificate has been already added to the CA root`);
      }
    } finally {
      try {
        await this.activateApp(this.opts.bundleId);
      } catch (e) {
        log.warn(`Cannot restore the application '${this.opts.bundleId}'. Original error: ${e.message}`);
      }
    }

    return (await fs.readFile(configPath)).toString('base64');
  } finally {
    await fs.rimraf(configPath);
  }
};

Object.assign(extensions, commands);
export { commands };
export default extensions;
