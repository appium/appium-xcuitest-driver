// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { TOUCHIDAPP_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import B from 'bluebird';
import { killAllSimulators } from '../helpers/simulator';


chai.should();
chai.use(chaiAsPromised);

const MOCHA_RETRIES = process.env.CI ? 3 : 1;

// touch id tests need to be on sims and need accessibility turned on
if (!process.env.REAL_DEVICE && !process.env.CI && !process.env.REMOTE) {
  describe('touchID()', function () {
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
        await driver.toggleTouchIdEnrollment(toggle);
      } catch (e) {
        e.message.should.match(/not supported/);
        return false;
      }
      return true;
    }

    describe('touchID enrollment functional tests applied to TouchId sample app', function () {
      beforeEach(async function () {
        driver = await initSession(TOUCHIDAPP_CAPS);
        await B.delay(2000); // Give the app a couple seconds to open
      });

      it('should not support touchID if not enrolled', async function () {
        if (await doEnrollment(false)) {
          let authenticateButton = await driver.elementByName(' Authenticate with Touch ID');
          await authenticateButton.click();
          await driver.elementByName('TouchID not supported').should.eventually.exist;
        }
      });

      it('should accept matching fingerprint if touchID is enrolled or it should not be supported if phone does not support touchID', async function () {
        if (await doEnrollment()) {
          let authenticateButton = await driver.elementByName(' Authenticate with Touch ID');
          await authenticateButton.click();
          await driver.touchId(true);
          try {
            await driver.elementByName('Authenticated Successfully').should.eventually.exist;
          } catch (ign) {
            await driver.elementByName('TouchID not supported').should.eventually.exist;
          }
        }
      });

      it('should reject not matching fingerprint if touchID is enrolled or it should not be supported if phone does not support touchID', async function () {
        if (await doEnrollment()) {
          let authenticateButton = await driver.elementByName(' Authenticate with Touch ID');
          await authenticateButton.click();
          await driver.touchId(false);
          try {
            await driver.elementByName('Try Again').should.eventually.exist;
          } catch (ign) {
            await driver.elementByName('TouchID not supported').should.eventually.exist;
          }
        }
      });

      it('should enroll touchID and accept matching fingerprints then unenroll touchID and not be supported', async function () {
        //Unenroll
        if (!await doEnrollment(false)) {
          return;
        }
        let authenticateButton = await driver.elementByName(' Authenticate with Touch ID');
        await authenticateButton.click();
        await driver.elementByName('TouchID not supported').should.eventually.exist;
        let okButton = await driver.elementByName('OK');
        await okButton.click();
        await B.delay(1000);

        // Re-enroll
        await doEnrollment();
        await authenticateButton.click();
        await driver.touchId(true);
        try {
          await driver.elementByName('Authenticated Successfully').should.eventually.exist;
        } catch (ign) {
          return await driver.elementByName('TouchID not supported').should.eventually.exist;
        }
        okButton = await driver.elementByName('OK');
        await okButton.click();
        await B.delay(1000);

        // Unenroll again
        await doEnrollment(false);
        authenticateButton = await driver.elementByName(' Authenticate with Touch ID');
        await authenticateButton.click();
        await driver.elementByName('TouchID not supported').should.eventually.exist;
      });
    });
  });
}
