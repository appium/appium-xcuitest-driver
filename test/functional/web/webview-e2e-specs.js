import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import { WEBVIEW_CAPS } from '../desired';
import { initSession, deleteSession } from '../helpers/session';
import { GUINEA_PIG_PAGE } from './helpers';


chai.should();
chai.use(chaiAsPromised);

// TODO: the rd gets disconnected for some reason
describe.skip('Webview', function () {
  this.timeout(120 * 1000);

  let driver;
  before(async () => {
    driver = await initSession(WEBVIEW_CAPS);
  });
  after(deleteSession);

  it('should start a session, navigate to url, get title', async () => {
    let contexts = await driver.contexts();
    contexts.length.should.be.at.least(2);

    let urlBar = await driver.elementByClassName('XCUIElementTypeTextField');
    await urlBar.clear();
    await urlBar.sendKeys(GUINEA_PIG_PAGE);

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
