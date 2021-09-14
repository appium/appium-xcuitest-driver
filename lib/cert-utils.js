import _ from 'lodash';
import { installSSLCert, hasSSLCert } from 'appium-ios-simulator';

/**
 * Check whether the given Simulator device supports simctl keychain API.
 *
 * @param {object} device Simulator instance created by appium-ios-simulator module
 * @returns {boolean} `true` if the current Simulator SDK supports keychain commands.
 */
const doesSupportKeychainApi = _.memoize(async function doesSupportKeychainApi (device) {
  try {
    await device.simctl.exec('help', {
      args: ['keychain']
    });
    return true;
  } catch (e) {
    return false;
  }
});

/**
 * Adds a certificate to the trusted root store.
 * Simulator must be in BOOTED state for this API to work.
 *
 * @param {object} device Simulator instance created by appium-ios-simulator module
 * @param {string} payload Certificate payload
 */
async function installCertificate (device, payload) {
  await device.simctl.addRootCertificate(payload, {raw: true});
}

/**
 * Check whether the given certificate is already installed.
 * The function is using hacky calls to make certificate stuff working for older SDKs.
 * Simulator must be in SHUTDOWN state for this API to work.
 *
 * @param {object} device Simulator instance created by appium-ios-simulator module
 * @param {string} payload Certificate payload
 * @returns {boolean} `true` if the certificate is already present in the root store.
 */
async function hasCertificateLegacy (device, payload) {
  return await hasSSLCert(payload, device.udid);
}

/**
 * Adds a certificate to the trusted root store.
 * The function is using hacky calls to make certificate stuff working for older SDKs.
 * Simulator must be in SHUTDOWN state for this API to work.
 *
 * @param {object} device Simulator instance created by appium-ios-simulator module
 * @param {string} payload Certificate payload
 */
async function installCertificateLegacy (device, payload) {
  await installSSLCert(payload, device.udid);
}


export {
  doesSupportKeychainApi, installCertificate, installCertificateLegacy,
  hasCertificateLegacy
};
