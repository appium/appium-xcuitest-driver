import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';

describe('session commands', function () {
  let driver = new XCUITestDriver();

  let chai;
  let mockDriver;

  before(async function () {
    chai = await import('chai');
    chai.should();
  });

  beforeEach(function () {
    mockDriver = sinon.mock(driver);
  });

  afterEach(function () {
    try {
      mockDriver.verify();
    } finally {
      proxySpy.reset();
      for (let stub of otherStubs) {
        stub.reset();
      }
    }
  });

  driver.opts.udid = 'cecinestpasuneudid';
  let proxySpy = sinon.stub(driver, 'proxyCommand').callsFake(async (endpoint, method) => {
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
  let otherStubs = [
    sinon.stub(driver, 'getStatusBarHeight').resolves(20),
    sinon.stub(driver, 'getViewportRect').resolves({height: 3, width: 4, left: 0, top: 0}),
    sinon.stub(driver, 'getScreenInfo').resolves({
      statusBarSize: {width: 400, height: 20},
      scale: 3,
    }),
    sinon.stub(driver, 'getDevicePixelRatio').resolves(3),
  ];
});
