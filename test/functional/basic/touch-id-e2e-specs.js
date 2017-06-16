// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { TOUCHIDAPP_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import B from 'bluebird';
import { killAllSimulators } from 'appium-ios-simulator';

chai.should();
chai.use(chaiAsPromised);

describe('touch ID', function () {
  this.timeout(MOCHA_TIMEOUT);
  let caps, driver;

  beforeEach(async () => {
    await killAllSimulators();
  });

  afterEach(async () => {
    await deleteSession();
    await B.delay(500);
  });

  after(async () => {
    await killAllSimulators();
  });

  it('should throw an error if allowTouchIdEnroll desired capability is not set', async () => {
    await killAllSimulators();
    caps = Object.assign(TOUCHIDAPP_CAPS);
    caps.allowTouchIdEnroll = false;
    driver = await initSession(caps);

    await driver.toggleTouchIdEnrollment().should.be.rejectedWith(/enroll touchId/);
  });

  describe('touchID enrollment functional tests applied to TouchId sample app', function () {
    beforeEach(async () => {
      caps = Object.assign(TOUCHIDAPP_CAPS);
      caps.allowTouchIdEnroll = true;
      driver = await initSession(caps);
      await B.delay(2000); // Give the app a couple seconds to open
    });

    it('should not support touchID if not enrolled', async () => {
      let authenticateButton = await driver.elementByName(' Authenticate with Touch ID');
      await authenticateButton.click();
      await driver.elementByName('TouchID not supported').should.eventually.exist;
    });

    it('should accept matching fingerprint if touchID is enrolled or it should not be supported if phone doesn\'t support touchID', async () => {
      let authenticateButton = await driver.elementByName(' Authenticate with Touch ID');
      await authenticateButton.click();
      await driver.touchId(true);
      try {
        await driver.elementByName('Authenticated Successfully').should.eventually.exist;
      } catch (ign) {
        await driver.elementByName('TouchID not supported').should.eventually.exist;
      }
    });

    it('should reject not matching fingerprint if touchID is enrolled or it should not be supported if phone doesn\'t support touchID', async () => {
      let authenticateButton = await driver.elementByName(' Authenticate with Touch ID');
      await authenticateButton.click();
      await driver.touchId(false);
      try {
        await driver.elementByName('Try Again').should.eventually.exist;
      } catch (ign) {
        await driver.elementByName('TouchID not supported').should.eventually.exist;
      }
    });

    it('should enroll touchID and accept matching fingerprints then unenroll touchID and not be supported', async () => {
      //Unenroll
      await driver.toggleTouchIdEnrollment();
      let authenticateButton = await driver.elementByName(' Authenticate with Touch ID');
      await authenticateButton.click();
      await driver.elementByName('TouchID not supported').should.eventually.exist;
      let okButton = await driver.elementByName('OK');
      await okButton.click();
      await B.delay(1000);

      // Re-enroll
      await driver.toggleTouchIdEnrollment();
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
      await driver.toggleTouchIdEnrollment();
      authenticateButton = await driver.elementByName(' Authenticate with Touch ID');
      await authenticateButton.click();
      await driver.elementByName('TouchID not supported').should.eventually.exist;
    });
  });

});
