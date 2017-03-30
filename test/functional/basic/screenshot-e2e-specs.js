import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import sinon from 'sinon';
import * as simctl from 'node-simctl';
import screenshot from '../../../lib/commands/screenshot';

chai.should();
chai.use(chaiAsPromised);


describe.only('XCUITestDriver - screenshots', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async () => {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async () => {
    await deleteSession();
  });


  beforeEach(async () => {
  });
  afterEach(async () => {
  });

  it('should take screenshot', async () => {
    await driver.takeScreenshot().should.eventually.be.a.string;
  });
});
