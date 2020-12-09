import XCUITestDriver from '../../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';


chai.should();
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('context', function () {
  describe('onPageChange', function () {
    const pageChangeNotification = {
      appIdKey: '5191',
      pageArray: [{
        id: 1,
        title: 'Appium/welcome',
        url: 'http://127.0.0.1:4443/welcome',
        isKey: true
      }, {
        id: 3,
        title: 'Bing!',
        url: 'https://www.bing.com/',
        isKey: false
      }, {
        id: 4,
        title: 'Google',
        url: 'https://www.google.com/?client=safari&channel=iphone_bm',
        isKey: true
      }, {
        id: 5,
        title: '',
        url: 'about:blank',
        isKey: false
      }]
    };
    it('should call select page if a new page is introduced and that page is not blacklisted', async function () {
      let driver = new XCUITestDriver();
      driver.curContext = '5191.5';
      driver.contexts = ['5191.5', '5191.3', '5191.4'];
      let selectPageArgs = null;
      const remoteMock = {
        isConnected: true,
        selectPage: (...args) => {
          selectPageArgs = args;
          return {catch: () => {}};
        },
      };
      driver.remote = remoteMock;
      driver.opts.safariIgnoreWebHostnames = 'www.google.com, www.bing.com,yahoo.com, about:blank, ';
      await driver.onPageChange(pageChangeNotification);
      selectPageArgs.should.eql(['5191', 1]);
    });
    it('should not call selectPage if a new page is introduced and that page is blacklisted', async function () {
      let driver = new XCUITestDriver();
      driver.curContext = '5191.1';
      const testContexts = [
        ['5191.1', '5191.3', '5191.4'],
        ['5191.1', '5191.3', '5191.5'],
      ];

      for (const testContext of testContexts) {
        driver.contexts = testContext;
        let selectPageArgs = null;
        const remoteMock = {
          isConnected: true,
          selectPage: (...args) => {
            selectPageArgs = args;
            return {catch: () => {}};
          },
        };
        driver.remote = remoteMock;
        driver.opts.safariIgnoreWebHostnames = 'www.google.com, www.bing.com,www.yahoo.com, about:blank, ';
        await driver.onPageChange(pageChangeNotification);
        expect(selectPageArgs).to.be.null;
      }
    });
  });
});
