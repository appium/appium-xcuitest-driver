import {amendCapabilities, FACEIDAPP_CAPS} from '../desired';
import {initSession, deleteSession, hasDefaultPrebuiltWDA, MOCHA_TIMEOUT} from '../helpers/session';
import B from 'bluebird';
import {killAllSimulators} from '../helpers/simulator';
import {CLASS_CHAIN_SEARCH} from '../helpers/element';
import {waitForCondition} from 'asyncbox';


const DEFAULT_IMPLICIT_TIMEOUT_MS = 1000;
const FACE_ID_SELECTOR = '**/XCUIElementTypeStaticText[`label == "Face ID"`]';
const FACE_ID_LOCATOR = `${CLASS_CHAIN_SEARCH}:${FACE_ID_SELECTOR}`;
const ALLOW_SELECTOR =
  '**/XCUIElementTypeStaticText[`label == "Do you want to allow “biometric” to use Face ID?"`]';
const ALLOW_LOCATOR = `${CLASS_CHAIN_SEARCH}:${ALLOW_SELECTOR}`;
const FACE_ID_SUCCEEDED_SELECTOR = '**/XCUIElementTypeStaticText[`label == "Succeeded"`]';
const FACE_ID_SUCCEEDED_LOCATOR = `${CLASS_CHAIN_SEARCH}:${FACE_ID_SUCCEEDED_SELECTOR}`;

const MOCHA_RETRIES = process.env.CI ? 3 : 1;

// face id tests need to be on sims and need accessibility turned on
if (!process.env.CI) {
  describe('XCUITestDriver - faceID -', function () {
    this.timeout(MOCHA_TIMEOUT * 2);
    this.retries(MOCHA_RETRIES);
    let driver;
    let chai;
    let expect;

    before(async function () {
      chai = await import('chai');
      const chaiAsPromised = await import('chai-as-promised');

      chai.should();
      chai.use(chaiAsPromised.default);
      expect = chai.expect;
    });

    afterEach(async function () {
      await deleteSession();
      await B.delay(500);
    });

    after(async function () {
      await killAllSimulators();
    });

    async function doEnrollment(toggle = true) {
      try {
        await driver.execute('mobile: enrollBiometric', {isEnabled: toggle});
      } catch (e) {
        e.message.should.match(/not supported/);
        return false;
      }
      return true;
    }

    async function waitUntilExist(locator, timeout = 5000) {
      await driver.setTimeout({implicit: 0});
      try {
        await waitForCondition(async () => (await driver.$$(locator)).length > 0, {
          waitMs: timeout,
          intervalMs: 300,
        });
      } catch {
        throw new Error(
          `Element located by '${locator}' done not exist after ${timeout}ms timeout`,
        );
      } finally {
        await driver.setTimeout({implicit: DEFAULT_IMPLICIT_TIMEOUT_MS});
      }
    }

    describe('faceID enrollment functional tests applied to FaceID sample app', function () {
      beforeEach(async function () {
        const caps = amendCapabilities(FACEIDAPP_CAPS, {
          'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
        });
        driver = await initSession(caps);
        await B.delay(2000); // Give the app a couple seconds to open
      });

      it('should not support faceID if not enrolled', async function () {
        expect(await doEnrollment(false)).to.be.true;
        const authenticateButton = await driver.$('~Authenticate with Face ID');
        await authenticateButton.click();
        expect(await driver.$('~Biometry is not enrolled.').elementId).to.exist;
      });

      it('should accept matching fingerprint if faceID is enrolled', async function () {
        expect(await doEnrollment()).to.be.true;
        const authenticateButton = await driver.$('~Authenticate with Face ID');
        await authenticateButton.click();

        await driver.updateSettings({defaultActiveApplication: 'com.apple.springboard'});
        // This is necessary only for the first time
        if (await driver.$(ALLOW_LOCATOR).elementId) {
          const okButton = await driver.$('~OK');
          await okButton.click();
        }
        await waitUntilExist(FACE_ID_LOCATOR);

        await driver.execute('mobile: sendBiometricMatch', {type: 'faceId', match: true});

        await driver.updateSettings({defaultActiveApplication: 'com.mwakizaka.biometric'});
        await waitUntilExist(FACE_ID_SUCCEEDED_LOCATOR);
        expect(await driver.$('~Succeeded').elementId).to.exist;
      });

      it('should reject not matching fingerprint if faceID is enrolled', async function () {
        expect(await doEnrollment()).to.be.true;
        const authenticateButton = await driver.$('~Authenticate with Face ID');
        await authenticateButton.click();

        await driver.updateSettings({defaultActiveApplication: 'com.apple.springboard'});
        // This is necessary only for the first time
        if (await driver.$(ALLOW_LOCATOR).elementId) {
          const okButton = await driver.$('~OK');
          await okButton.click();
        }
        await waitUntilExist(FACE_ID_LOCATOR);

        await driver.execute('mobile: sendBiometricMatch', {type: 'faceId', match: false});
        expect(await driver.$('~Try Again').elementId).to.exist;
      });

      it('should enroll faceID and accept matching fingerprints then unenroll faceID and not be supported', async function () {
        // Unenroll
        expect(await doEnrollment(false)).to.be.true;
        let authenticateButton = await driver.$('~Authenticate with Face ID');
        await authenticateButton.click();
        expect(await driver.$('~Biometry is not enrolled.').elementId).to.exist;
        let okButton = await driver.$('~OK');
        await okButton.click();
        await B.delay(1000);

        // Re-enroll
        await doEnrollment();
        await authenticateButton.click();

        await driver.updateSettings({defaultActiveApplication: 'com.apple.springboard'});
        // This is necessary only for the first time
        if (await driver.$(ALLOW_LOCATOR).elementId) {
          const okButton = await driver.$('~OK');
          await okButton.click();
        }
        await waitUntilExist(FACE_ID_LOCATOR);

        await driver.execute('mobile: sendBiometricMatch', {type: 'faceId', match: true});

        await driver.updateSettings({defaultActiveApplication: 'com.mwakizaka.biometric'});
        await waitUntilExist(FACE_ID_SUCCEEDED_LOCATOR);
        const succceeded = await driver.$('~Succeeded');
        expect(succceeded.elementId).to.exist;
        // Here needs to click ok on the popup after the overlay goes away.
        await waitForCondition(async () => {
          try {
            await driver.$(`~OK`).click();
            return false;
          } catch {
            return true;
          }
        }, {waitMs: 10_000, intervalMs: 200 });

        // Unenroll again
        await doEnrollment(false);
        authenticateButton = await driver.$('~Authenticate with Face ID');
        await authenticateButton.click();
        await waitUntilExist('~Biometry is not enrolled.');
        expect(await driver.$('~Biometry is not enrolled.').elementId).to.exist;
      });
    });
  });
}
