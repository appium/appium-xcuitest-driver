import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';

describe('session commands', function () {
  const driver = new XCUITestDriver();

  let mockDriver;

  beforeEach(function () {
    mockDriver = sinon.mock(driver);
  });

  afterEach(function () {
    try {
      mockDriver.verify();
    } finally {
      proxySpy.reset();
      for (const stub of otherStubs) {
        stub.reset();
      }
    }
  });

  driver.opts.udid = 'cecinestpasuneudid';
  const proxySpy = sinon.stub(driver, 'proxyCommand').callsFake(async (endpoint, method) => {
    if (endpoint === '/' && method === 'GET') {
      // XXX this is synchronous
      return await {
        capabilities: {
          sillyCap: true,
          app: 'LOL.app',
        },
      };
    }
    // XXX this is synchronous
    return await {};
  });
  const otherStubs = [
    sinon.stub(driver, 'getStatusBarHeight').resolves(20),
    sinon.stub(driver, 'getViewportRect').resolves({height: 3, width: 4, left: 0, top: 0}),
    sinon.stub(driver, 'getScreenInfo').resolves({
      statusBarSize: {width: 400, height: 20},
      scale: 3,
    }),
    sinon.stub(driver, 'getDevicePixelRatio').resolves(3),
  ];
});
