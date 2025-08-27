import B from 'bluebird';
import {UICATALOG_CAPS} from '../desired';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';


describe('XCUITestDriver - performance', function () {
  this.timeout(MOCHA_TIMEOUT);
  const profileName = 'Time Profiler';

  let driver;
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

  describe('record performance metrics', function () {
    before(async function () {
      // Don't do these tests on Sauce Labs
      if (process.env.CI) {
        this.skip();
      }

      driver = await initSession(UICATALOG_CAPS);
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
