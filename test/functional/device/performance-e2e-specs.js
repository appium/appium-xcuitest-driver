import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import {amendCapabilities, UICATALOG_CAPS} from '../desired';
import {initSession, deleteSession, getUsePrebuiltWDACaps, MOCHA_TIMEOUT} from '../helpers/session';

chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - performance', function () {
  this.timeout(MOCHA_TIMEOUT);
  const profileName = 'Time Profiler';

  let driver;

  describe('record performance metrics', function () {
    before(async function () {
      // Don't do these tests on Sauce Labs
      if (process.env.CI) {
        this.skip();
      }

      const caps = amendCapabilities(UICATALOG_CAPS, await getUsePrebuiltWDACaps());
      driver = await initSession(caps);
    });
    after(async function () {
      await deleteSession();
    });

    it('should return recorded trace file on stop', async function () {
      await driver.execute('mobile: startPerfRecord', {
        profileName,
      });
      await B.delay(5000);
      (
        await driver.execute('mobile: stopPerfRecord', {
          profileName,
        })
      ).should.not.be.empty;
    });
  });
});
