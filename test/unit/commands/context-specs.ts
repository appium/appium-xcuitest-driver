import {XCUITestDriver} from '../../../lib/driver';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('context', function () {
  describe('onPageChange', function () {
    const pageChangeNotification = {
      appIdKey: '5191',
      pageArray: [
        {
          id: 1,
          title: 'Appium/welcome',
          url: 'http://127.0.0.1:4443/welcome',
          isKey: true,
        },
        {
          id: 3,
          title: 'Bing!',
          url: 'https://www.bing.com/',
          isKey: false,
        },
        {
          id: 4,
          title: 'Google',
          url: 'https://www.google.com/?client=safari&channel=iphone_bm',
          isKey: true,
        },
        {
          id: 5,
          title: '',
          url: 'about:blank',
          isKey: false,
        },
      ],
    };
    it('should call select page if a new page is introduced and that page is not blacklisted', async function () {
      const driver = new XCUITestDriver({} as any);
      driver.curContext = '5191.5';
      driver.contexts = ['5191.5', '5191.3', '5191.4'];
      /** @type {undefined|(string|number)[]} */
      let selectPageArgs: (string | number)[] | undefined;
      const remoteMock = {
        isConnected: true,
        selectPage: (...args: any[]) => {
          selectPageArgs = args;
          return {catch: () => {}};
        },
      } as any;
      driver._remote = remoteMock;
      driver.opts.safariIgnoreWebHostnames =
        'www.google.com, www.bing.com,yahoo.com, about:blank, ';
      await driver.onPageChange(pageChangeNotification);
      expect(selectPageArgs).to.eql(['5191', 1]);
    });
    it('should not call selectPage if a new page is introduced and that page is blacklisted', async function () {
      const driver = new XCUITestDriver({} as any);
      driver.curContext = '5191.1';
      const testContexts = [
        ['5191.1', '5191.3', '5191.4'],
        ['5191.1', '5191.3', '5191.5'],
      ];

      for (const testContext of testContexts) {
        driver.contexts = testContext;
        let selectPageArgs: (string | number)[] | null = null;
        const remoteMock = {
          isConnected: true,
          selectPage: (...args: any[]) => {
            selectPageArgs = args;
            return {catch: () => {}};
          },
        } as any;
        driver._remote = remoteMock;
        driver.opts.safariIgnoreWebHostnames =
          'www.google.com, www.bing.com,www.yahoo.com, about:blank, ';
        await driver.onPageChange(pageChangeNotification);
        expect(selectPageArgs).to.be.null;
      }
    });
  });
});
