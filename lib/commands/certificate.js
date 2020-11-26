import _ from 'lodash';
import { fs, plist, tempDir, util } from 'appium-support';
import { iosCommands } from 'appium-ios-driver';
import { retryInterval, retry, waitForCondition } from 'asyncbox';
import B from 'bluebird';
import log from '../logger';
import os from 'os';
import path from 'path';
import http from 'http';
import { exec } from 'teen_process';
import { findAPortNotInUse, checkPortStatus } from 'portscanner';

let extensions = {}, commands = {};

const CONFIG_EXTENSION = 'mobileconfig';
const HOST_PORT_RANGE = [38200, 38299];
const TMPSERVER_STARTUP_TIMEOUT = 5000;
const Settings = {
  General: {
    type: 'accessibility id',
    value: 'General',
  },
  Profile: {
    type: '-ios predicate string',
    value: `name BEGINSWITH 'Profile'`,
  },
  About: {
    type: 'accessibility id',
    value: 'About',
  },
  Certificate_Trust_Settings: {
    type: 'accessibility id',
    value: 'Certificate Trust Settings',
  },
};
const Button = {
  Install: {
    type: 'accessibility id',
    value: 'Install',
  },
  Allow: {
    type: 'accessibility id',
    value: 'Allow',
  },
  Done: {
    type: 'accessibility id',
    value: 'Done',
  },
  Return_to_Settings: {
    type: 'accessibility id',
    value: 'Return to Settings',
  },
};
const Alert = {
  Install: {
    type: '-ios class chain',
    value: '**/XCUIElementTypeAny[`type == \'XCUIElementTypeAlert\' OR type == \'XCUIElementTypeSheet\'`]/**/XCUIElementTypeButton[`label == \'Install\'`]',
  },
};


async function extractCommonName (certBuffer) {
  const tempCert = await tempDir.open({
    prefix: 'cert',
    suffix: '.cer'
  });
  try {
    await fs.writeFile(tempCert.path, certBuffer);
    const {stdout} = await exec('openssl', ['x509', '-noout', '-subject', '-in', tempCert.path]);
    return parseCommonName(stdout);
  } catch (err) {
    throw new Error(`Cannot parse common name value from the certificate. Is it valid and base64-encoded? ` +
                    `Original error: ${err.message}`);
  } finally {
    await fs.rimraf(tempCert.path);
  }
}

const LIBRE_SSL_PATTERN = /\/CN=([^\/]+)/; // eslint-disable-line no-useless-escape
const OPEN_SSL_PATTERN = /,\sCN\s=\s([^,]+)/;

function parseCommonName (stringCertificate) {
  const result = [LIBRE_SSL_PATTERN, OPEN_SSL_PATTERN].reduce((acc, r) => {
    if (acc) {
      return acc;
    }
    const match = r.exec(stringCertificate);
    return match && match[1];
  }, null);
  if (!result) {
    throw new Error(`There is no common name value in '${stringCertificate}' output`);
  }
  return result;
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
  const getUUID = () => util.uuidV4().toUpperCase();
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

async function installPre122Certificate (driver) {
  // Accept Safari alert
  await clickElement(driver, Button.Allow, {
    // certificate load might take some time on slow machines
    timeout: 15000,
  });
  // Wait until Preferences are opened
  await B.delay(2000);

  // Go through Preferences wizard
  if (!await clickElement(driver, Button.Install, {
    skipIfInvisible: true,
  })) {
    return false;
  }
  // We need to click Install button on two different tabs
  // The second one confirms the previous
  await B.delay(1500);
  await clickElement(driver, Button.Install);
  // Accept alert
  await clickElement(driver, Alert.Install);
  // Finish adding certificate
  await clickElement(driver, Button.Done);
  return true;
}

async function trustCertificateInPreferences (driver, name) {
  await clickElement(driver, Settings.General);
  await clickElement(driver, Settings.About);
  const switchLocator = {
    type: '-ios class chain',
    value: `**/XCUIElementTypeCell[\`label == '${name}'\`]/**/XCUIElementTypeSwitch`,
  };
  await retry(5, async () => {
    await driver.mobileSwipe({
      element: await driver.findNativeElementOrElements('class name', 'XCUIElementTypeTable', false),
      direction: 'up'
    });
    await clickElement(driver, Settings.Certificate_Trust_Settings, {
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

async function installPost122Certificate (driver, name) {
  // Accept Safari alert
  await clickElement(driver, Button.Allow, {
    // certificate load might take some time on slow machines
    timeout: 15000,
  });
  // Wait for the second alert
  await B.delay(2000);

  await driver.postAcceptAlert();
  await driver.activateApp('com.apple.Preferences');
  await clickElement(driver, Settings.General);
  await clickElement(driver, Settings.Profile);
  // Select the target cert
  let isCertFound = false;
  for (let swipeNum = 0; swipeNum < 5; ++swipeNum) {
    if (await clickElement(driver, {
      type: '-ios class chain',
      value: `**/XCUIElementTypeCell[\`label == '${name}'\`]`,
    }, {
      timeout: 500,
      skipIfInvisible: true,
    })) {
      isCertFound = true;
      break;
    }

    await driver.mobileSwipe({
      element: await driver.findNativeElementOrElements('class name', 'XCUIElementTypeTable', false),
      direction: 'up'
    });
  }
  if (!isCertFound) {
    throw new Error(`'${name}' cannot be found in the certificates list`);
  }

  // Install option is only visible if the cert is not installed yet
  if (!await clickElement(driver, Button.Install, {
    skipIfInvisible: true,
  })) {
    return false;
  }
  await B.delay(1500);
  // Confirm untrusted cert install
  await clickElement(driver, Button.Install);
  // Accept alert
  await clickElement(driver, Alert.Install);
  // Finish adding certificate
  await clickElement(driver, Button.Done);

  return true;
}

/**
 * @typedef {Object} CertificateInstallationOptions
 *
 * @property {!string} content - Base64-encoded content of the public certificate
 * @property {?string} commonName - Common name of the certificate. If this is not set
 * then the script will try to parse it from the given certificate content.
 * @property {?boolean} isRoot [true] - This option defines where the certificate should be
 * installed to: either Trusted Root Store (`true`, the default option) or
 * the Keychain (`false`). On environments other than Xcode 11.4+ Simulator this
 * option is ignored.
 */

/**
 * Installs a custom certificate onto the device.
 * Since Xcode SDK 11.4 Apple has added a dedicated simctl subcommand to quickly handle
 * certificates on Simulator over CLI.
 * On real devices or simulators before Xcode 11.4 SDK
 * Apple provides no official way to do it via the command line.
 * In such case (and also as a fallback if CLI setup fails)
 * this method tries to wrap the certificate into .mobileconfig format
 * and then deploys the wrapped file to the internal HTTP server,
 * so one can open it via mobile Safari.
 * Then the algorithm goes through the profile installation procedure by
 * clicking the necessary buttons using WebDriverAgent.
 *
 * @param {CertificateInstallationOptions} opts
 * @returns {?string} The content of the generated .mobileconfig file as
 * base64-encoded string. This config might be useful for debugging purposes.
 * If the certificate has been successfully set via CLI then nothing is returned.
 */
commands.mobileInstallCertificate = async function mobileInstallCertificate (opts = {}) {
  const {
    content,
    commonName,
    isRoot = true,
  } = opts;
  if (_.isEmpty(content)) {
    throw new Error('Certificate content should not be empty');
  }

  if (this.isSimulator()) {
    try {
      const methodName = isRoot ? 'addRootCertificate' : 'addCertificate';
      return void (await this.opts.device.simctl[methodName](content, {raw: true}));
    } catch (e) {
      log.debug(e);
      log.info(`The certificate cannot be installed via CLI. ` +
        `Falling back to UI-based deployment`);
    }
  }

  const tmpRoot = await tempDir.openDir();
  const tmpPort = await findAPortNotInUse(HOST_PORT_RANGE[0], HOST_PORT_RANGE[1]);
  const configName = `appium.${CONFIG_EXTENSION}`;
  const configPath = path.resolve(tmpRoot, configName);
  const tmpServer = http.createServer(async function (_, res) {
    const configFile = await fs.readFile(configPath);
    res.end(configFile);
  });
  try {
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
      const host = os.hostname();
      const certUrl = `http://${host}:${tmpPort}/${configName}`;
      await tmpServer.listen(tmpPort);
      try {
        await waitForCondition(async () => {
          try {
            return (await checkPortStatus(tmpPort, host)) === 'open';
          } catch (ign) {
            return false;
          }
        }, {
          waitMs: TMPSERVER_STARTUP_TIMEOUT,
          intervalMs: 300,
        });
        log.debug(`The temporary web server is running at http://${host}:${tmpPort}`);
      } catch (e) {
        throw new Error(`The temporary web server cannot be started at http://${host}:${tmpPort}.`);
      }
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
        await this.opts.device.openUrl(certUrl);
      }

      let isCertAlreadyInstalled = false;
      if (util.compareVersions(this.opts.platformVersion, '>=', '12.2')) {
        if (await installPost122Certificate(this, cn)) {
          await clickElement(this, Settings.Profile);
          await trustCertificateInPreferences(this, cn);
        } else {
          isCertAlreadyInstalled = true;
        }
      } else {
        if (await installPre122Certificate(this)) {
          await clickElement(this, Button.Return_to_Settings);
          await trustCertificateInPreferences(this, cn);
        } else {
          isCertAlreadyInstalled = true;
        }
      }
      if (isCertAlreadyInstalled) {
        log.info(`It looks like the '${cn}' certificate has been already added to the CA root`);
      }
    } finally {
      if (this.opts.bundleId) {
        try {
          await this.activateApp(this.opts.bundleId);
        } catch (e) {
          log.warn(`Cannot restore the application '${this.opts.bundleId}'. Original error: ${e.message}`);
        }
      }
    }

    return (await util.toInMemoryBase64(configPath)).toString();
  } finally {
    await tmpServer.close();
    await fs.rimraf(tmpRoot);
  }
};

Object.assign(extensions, commands);
export { commands, parseCommonName };
export default extensions;
