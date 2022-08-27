import sinon from 'sinon';
import XCUITestDriver from '../../../lib/driver';
import chai from 'chai';

chai.should();

describe('session commands', function () {
  let driver = new XCUITestDriver();
  driver.opts.udid = 'cecinestpasuneudid';
  let proxySpy = sinon.stub(driver, 'proxyCommand').callsFake(async (endpoint, method) => { // eslint-disable-line require-await
    if (endpoint === '/' && method === 'GET') {
      return {
        capabilities: {
          sillyCap: true,
          app: 'LOL.app',
        }
      };
    }
    return {};
  });
  let otherStubs = [
    sinon.stub(driver, 'getStatusBarHeight').returns(20),
    sinon.stub(driver, 'getViewportRect').returns({x: 1, y: 2, height: 3, width: 4}),
    sinon.stub(driver, 'getScreenInfo').returns({
      statusBarSize: {width: 400, height: 20},
      scale: 3
    }),
    sinon.stub(driver, 'getDevicePixelRatio').returns(3)
  ];

  afterEach(function () {
    proxySpy.reset();
    for (let stub of otherStubs) {
      stub.reset();
    }
  });

  describe('getSession', function () {
    it('should merge caps with WDA response', async function () {
      driver.caps = {
        platformName: 'iOS',
        javascript_enabled: true,
        app: 'NOTLOL.app',
      };
      driver.deviceCaps = undefined;
      let res = await driver.getSession();
      proxySpy.calledOnce.should.be.true;
      res.should.eql({
        sillyCap: true,
        app: 'LOL.app',
        platformName: 'iOS',
        javascript_enabled: true,
        udid: 'cecinestpasuneudid',
        statBarHeight: 20,
        viewportRect: {x: 1, y: 2, height: 3, width: 4},
        pixelRatio: 3,
      });
    });

    it('should merge caps with WDA response without screen info', async function () {
      driver.caps = {
        platformName: 'iOS',
        javascript_enabled: true,
        app: 'NOTLOL.app',
      };
      driver.deviceCaps = undefined;
      driver.opts.includeDeviceCapsToSessionInfo = false;
      let res = await driver.getSession();
      proxySpy.calledOnce.should.be.false;
      res.should.eql({
        sillyCap: true,
        app: 'LOL.app',
        platformName: 'iOS',
        javascript_enabled: true,
        udid: 'cecinestpasuneudid'
      });
    });
  });
});
