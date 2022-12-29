// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { amendCapabilities, TOUCHIDAPP_CAPS } from '../desired';
import { initSession, deleteSession, hasDefaultPrebuiltWDA, MOCHA_TIMEOUT } from '../helpers/session';
import B from 'bluebird';
import { killAllSimulators } from '../helpers/simulator';


chai.should();
chai.use(chaiAsPromised);
const expect = chai.expect;

const MOCHA_RETRIES = process.env.CI ? 3 : 1;

// touch id tests need to be on sims and need accessibility turned on
if (!process.env.REAL_DEVICE && !process.env.CI && !process.env.CLOUD) {
  describe('XCUITestDriver - touchID -', function () {
    this.timeout(MOCHA_TIMEOUT * 2);
    this.retries(MOCHA_RETRIES);
    let driver;

    beforeEach(async function () {
      await killAllSimulators();
    });

    afterEach(async function () {
      await deleteSession();
      await B.delay(500);
    });

    after(async function () {
      await killAllSimulators();
    });

    async function doEnrollment (toggle = true) {
      try {
        await driver.toggleEnrollTouchId(toggle);
      } catch (e) {
        e.message.should.match(/not supported/);
        return false;
      }
      return true;
    }

    describe('touchID enrollment functional tests applied to TouchId sample app', function () {
      beforeEach(async function () {
        const caps = amendCapabilities(TOUCHIDAPP_CAPS, {
          'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
        });
        driver = await initSession(caps);
        await B.delay(2000); // Give the app a couple seconds to open
      });

      it('should not support touchID if not enrolled', async function () {
        if (await doEnrollment(false)) {
          const authenticateButton = await driver.$('~Authenticate with Touch ID');
          await authenticateButton.click();
          expect(await driver.$('~Biometry is not enrolled.').elementId).to.exist;
        }
      });

      it('should accept matching fingerprint if touchID is enrolled', async function () {
        if (await doEnrollment()) {
          const authenticateButton = await driver.$('~Authenticate with Touch ID');
          await authenticateButton.click();
          await driver.touchId(true);
          expect(await driver.$('~Succeeded').elementId).to.exist;
        }
      });

      it('should reject not matching fingerprint if touchID is enrolled', async function () {
        if (await doEnrollment()) {
          const authenticateButton = await driver.$('~Authenticate with Touch ID');
          await authenticateButton.click();
          await driver.touchId(false);
          expect(await driver.$('~Try Again').elementId).to.exist;
        }
      });

      it('should enroll touchID and accept matching fingerprints then unenroll touchID and not be supported', async function () {
        //Unenroll
        if (!await doEnrollment(false)) {
          return;
        }
        let authenticateButton = await driver.$('~Authenticate with Touch ID');
        await authenticateButton.click();
        expect(await driver.$('~Biometry is not enrolled.').elementId).to.exist;
        let okButton = await driver.$('~OK');
        await okButton.click();
        await B.delay(1000);

        // Re-enroll
        await doEnrollment();
        await authenticateButton.click();
        await driver.touchId(true);
        expect(await driver.$('~Succeeded').elementId).to.exist;
        okButton = await driver.$('~OK');
        await okButton.click();
        await B.delay(1000);

        // Unenroll again
        await doEnrollment(false);
        authenticateButton = await driver.$('~Authenticate with Touch ID');
        await authenticateButton.click();
        expect(await driver.$('~Biometry is not enrolled.').elementId).to.exist;
      });
    });
  });
}
