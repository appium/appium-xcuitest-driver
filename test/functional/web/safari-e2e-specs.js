import { startServer } from '../../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import { killAllSimulators } from 'appium-ios-simulator';
import { HOST, PORT } from '../helpers/session';
import { SAFARI_CAPS } from '../desired';
import { spinTitle, GUINEA_PIG_PAGE } from './helpers';


chai.should();
chai.use(chaiAsPromised);

describe('Safari', function () {
  this.timeout(10 * 60 * 1000);

  let server, driver;
  before(async () => {
    await killAllSimulators();

    driver = wd.promiseChainRemote(HOST, PORT);
    server = await startServer(PORT, HOST);
  });

  afterEach(async function () {
    await driver.quit();
  });

  after(async () => {
    await server.close();
  });

  it('should start a session, navigate to url, get title', async function () {
    await driver.init(SAFARI_CAPS);
    let title = await spinTitle(driver);
    title.should.equal('Appium/welcome');

    await driver.get(GUINEA_PIG_PAGE);
    title = await driver.title();
    title.should.include('I am a page title');
  });

  it('should delete a session, then be able to start another session', async function () {
    await driver.init(SAFARI_CAPS);
    await driver.quit();
    await driver.init(SAFARI_CAPS);
  });
});
