import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import { killAllSimulators } from 'appium-ios-simulator';
import { UICATALOG_CAPS } from '../desired';
import { initDriver, deleteSession, HOST, PORT } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('Webview', function () {
  this.timeout(120 * 1000);

  let driver;
  before(async () => {
    driver = await initDriver();
  });
  after(deleteSession);

  beforeEach(async () => {
    await killAllSimulators();
    
    await driver.init(UICATALOG_CAPS);
    let el = await driver.elementByAccessibilityId('Web View');
    await driver.execute('mobile: scroll', {element: el, toVisible: true});
    await el.click();
  });
  afterEach(async () => {
    await driver.quit();
  });

  it('should start a session, navigate to url, get title', async () => {
    let contexts = await driver.contexts();
    contexts.length.should.be.at.least(2);

    let urlBar = await driver.elementByClassName('XCUIElementTypeTextField');
    await urlBar.clear();
    await urlBar.sendKeys(`http://${HOST}:${PORT}/test/guinea-pig`);

    let buttons = await driver.elementsByClassName('XCUIElementTypeButton');
    await _.last(buttons).click();

    await driver.setImplicitWaitTimeout(10000);
    await driver.context(contexts[1]);

    // wait for something on the page, before checking on title
    await driver.elementById('i_am_a_textbox');

    let title = await driver.title();
    title.should.equal('I am a page title');
  });
});
