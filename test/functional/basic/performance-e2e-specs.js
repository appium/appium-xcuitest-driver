import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, getServer, MOCHA_TIMEOUT } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - performance', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  describe('record performance metrics', function () {
    before(async function () {
      if (process.env.CLOUD) {
        return this.skip();
      }
      driver = await initSession(UICATALOG_CAPS);
      getServer().driver.relaxedSecurityEnabled = true;
    });
    after(async function () {
      await deleteSession();
    });

    it('should return recorded trace file on stop', async function () {
      if (process.env.CI) {
        // It looks like Travis is just way too slow
        return this.skip();
      }
      await driver.execute('mobile: startPerfRecord', {});
      await B.delay(5000);
      (await driver.execute('mobile: stopPerfRecord', {})).should.not.be.empty;
    });
  });
});
