// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { SAFARI_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import B from 'bluebird';

chai.should();
chai.use(chaiAsPromised);

if (process.env.REAL_DEVICE) {
  describe('ios_webkit_debug_proxy: ', function () {
    this.timeout(MOCHA_TIMEOUT);
    let caps, driver;

    beforeEach(async function () {
      caps = Object.assign(SAFARI_CAPS);
      caps.startIWDP = true;
    });

    afterEach(async function () {
      await deleteSession();
      await B.delay(500);
    });

    it('Should start a Safari session if "caps.startIWDP === true"', async function () {
      caps.startIWDP = true;
      driver = await initSession(caps);
      await driver.source().should.not.be.rejected;
      await driver.quit();
    });

    it('Should not start a Safari session if "caps.startIWDP === false"', async function () {
      caps.startIWDP = false;
      await initSession(caps).should.be.rejectedWith(/environment you requested was unavailable/);
    });
  });
}