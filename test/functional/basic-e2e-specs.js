import { startServer } from '../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import { UICATALOG_CAPS } from './desired';


chai.should();
chai.use(chaiAsPromised);

const HOST = "localhost",
      PORT = 4994;

describe('XCUITestDriver - basics', function () {
  this.timeout(200 * 1000);

  let server, driver;
  before(async () => {
    driver = wd.promiseChainRemote(HOST, PORT);
    server = await startServer(PORT, HOST);
    await driver.init(UICATALOG_CAPS);
  });
  after(async () => {
    await driver.quit();
    await server.close();
  });

  describe('source', () => {
    it('should get the source for the page', async () => {
      let src = await driver.source();
      (typeof src).should.eql('string');
      src.indexOf('<AppiumAUT>').should.not.eql(-1);
    });
  });
});
