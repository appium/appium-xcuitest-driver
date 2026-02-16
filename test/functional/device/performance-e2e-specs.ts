import B from 'bluebird';
import {getUICatalogCaps} from '../desired';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

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

      const uiCatalogCaps = await getUICatalogCaps();
      driver = await initSession(uiCatalogCaps);
    });
    after(async function () {
      await deleteSession();
    });

    it('should return recorded trace file on stop', async function () {
      await driver.execute('mobile: startPerfRecord', {
        profileName,
      });
      await B.delay(5000);
      expect(
        await driver.execute('mobile: stopPerfRecord', {
          profileName,
        }),
      ).to.not.be.empty;
    });
  });
});
