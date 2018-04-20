import _ from 'lodash';
import { fs, plist } from 'appium-support';
import { iosCommands } from 'appium-ios-driver';
import { STATIC_DIR } from 'appium-base-driver';
import { openUrl } from 'node-simctl';
import { retryInterval } from 'asyncbox';
import B from 'bluebird';
import log from '../logger';
import os from 'os';
import path from 'path';
import UUID from 'uuid-js';
import x509 from 'x509';


let extensions = {}, commands = {};

const CONFIG_EXTENSION = 'mobileconfig';


/**
 * Generates Apple's over-the-air configuration profile
 * for certificate deployment based on the given PEM certificate content.
 * Read https://developer.apple.com/library/content/documentation/NetworkingInternet/Conceptual/iPhoneOTAConfiguration/Introduction/Introduction.html
 * for more details on such profiles.
 *
 * @param {Buffer} certBuffer - The actual content of PEM certificate encoded into NodeJS buffer
 * @returns {Object} The encoded structure of the given certificate, which is ready to be passed
 * as an argument to plist builder
 * @throws {Error} If the given certificate cannot be parsed
 */
async function toMobileConfig (certBuffer) {
  let subject = {};
  try {
    subject = x509.getSubject(certBuffer.toString('ascii'));
  } catch (err) {
    throw new Error(`Cannot parse the certificate. Is it valid and base64-encoded? ` +
                    `Original error: ${err.message}`);
  }
  const displayName = _.replace(subject.commonName, /\*/g, '_');
  if (_.isEmpty(displayName)) {
    throw new Error(`Cannot parse commonName field from the certificate subject. ` +
                    `Original value: ${JSON.stringify(subject)}`);
  }
  const getUUID = () => UUID.create().hex.toUpperCase();
  const contentUuid = getUUID();
  return {
    PayloadContent: [{
      PayloadCertificateFileName: `${displayName}.cer`,
      PayloadContent: certBuffer,
      PayloadDescription: 'Adds a CA root certificate',
      PayloadDisplayName: displayName,
      PayloadIdentifier: `com.apple.security.root.${contentUuid}`,
      PayloadType: 'com.apple.security.root',
      PayloadUUID: contentUuid,
      PayloadVersion: 1
    }],
    PayloadDisplayName: displayName,
    PayloadIdentifier: `${os.hostname().split('.')[0]}.${getUUID()}`,
    PayloadRemovalDisallowed: false,
    PayloadType: 'Configuration',
    PayloadUUID: getUUID(),
    PayloadVersion: 1
  };
}

async function clickElement (driver, locator, timeout = 5000) {
  let element = null;
  const lookupDelay = 500;
  try {
    element = await retryInterval(timeout / lookupDelay, lookupDelay,
       async () => await driver.findNativeElementOrElements(locator.type, locator.value, false)
    );
  } catch (err) {
    throw new Error(`Cannot find ${JSON.stringify(locator)} within ${timeout}ms timeout`);
  }
  await driver.nativeClick(element);
}

async function installCertificateInPreferences (driver) {
  // Accept Safari alert
  await clickElement(driver, {
    type: 'accessibility id',
    value: 'Allow'
  });
  await B.delay(2000);

  // Go through Preferences wizard
  await clickElement(driver, {
    type: 'accessibility id',
    value: 'Install'
  });
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
}

/**
 * @typedef {Object} CertificateInstallationOptions
 *
 * @property {!string} content - Base64-encoded content of the public certificate
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
  const {content} = opts;
  if (_.isEmpty(content)) {
    throw new Error('Certificate content should not be empty');
  }

  if (!await fs.exists(STATIC_DIR)) {
    throw new Error(`The static content root '${STATIC_DIR}' ` +
                    `does not exist or is not accessible`);
  }
  const configName = `${(Math.random() * 0x100000000 + 1).toString(36)}.${CONFIG_EXTENSION}`;
  const configPath = path.resolve(STATIC_DIR, configName);
  const mobileConfig = await toMobileConfig(Buffer.from(content, 'base64'));
  try {
    await plist.updatePlistFile(configPath, mobileConfig, false, false);
  } catch (err) {
    throw new Error(`Cannot store the generated config as '${configPath}'. ` +
                    `Original error: ${err.message}`);
  }
  try {
    const {address, port} = this.server.address();
    const certUrl = `http://${address ? address : os.hostname()}` +
                    `:${port ? port : 4723}/${configName}`;
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

      await installCertificateInPreferences(this);
    } finally {
      try {
        await this.activateApp(this.opts.bundleId);
      } catch (e) {
        log.warn(`Cannot restore the application '${this.opts.bundleId}'. ` +
                 `Original error: ${e.message}`);
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
