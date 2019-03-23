import sinon from 'sinon';
import * as iosDriver from 'appium-ios-driver';
import { JWProxy } from 'appium-base-driver';
import XCUITestDriver from '../..';
import xcode from 'appium-xcode';
import _ from 'lodash';
import chai from 'chai';
import * as utils from '../../lib/utils';
import { MOCHA_LONG_TIMEOUT } from './helpers';


chai.should();
const expect = chai.expect;

const caps = {
  platformName: 'iOS',
  deviceName: 'iPhone 6',
  app: '/foo.app',
  platformVersion: '10.0',
};

describe('driver commands', function () {
  describe('status', function () {
    let driver;
    let jwproxyCommandSpy;

    beforeEach(function () {
      driver = new XCUITestDriver();

      // fake the proxy to WDA
      const jwproxy = new JWProxy();
      jwproxyCommandSpy = sinon.stub(jwproxy, 'command').callsFake(async function () { // eslint-disable-line require-await
        return {some: 'thing'};
      });
      driver.wda = {
        jwproxy,
      };
    });

    afterEach(function () {
      jwproxyCommandSpy.reset();
    });

    it('should not have wda status by default', async function () {
      const status = await driver.getStatus();
      jwproxyCommandSpy.calledOnce.should.be.false;
      expect(status.wda).to.be.undefined;
    });

    it('should return wda status if cached', async function () {
      driver.cachedWdaStatus = {};
      const status = await driver.getStatus();
      jwproxyCommandSpy.called.should.be.false;
      status.wda.should.exist;
    });
  });

  describe('createSession', function () {
    let driver;
    let sandbox;

    beforeEach(function () {
      driver = new XCUITestDriver();
      sandbox = sinon.createSandbox();
      sandbox.stub(driver, 'determineDevice').callsFake(async function () { // eslint-disable-line require-await
        return {
          device: {
            shutdown: _.noop,
            isRunning () {
              return true;
            },
            stat () {
              return {state: 'Booted'};
            },
            clearCaches: _.noop,
          },
          udid: null,
          realDevice: null
        };
      });
      sandbox.stub(driver, 'configureApp').callsFake(_.noop);
      sandbox.stub(driver, 'startLogCapture').callsFake(_.noop);
      sandbox.stub(driver, 'startSim').callsFake(_.noop);
      sandbox.stub(driver, 'startWdaSession').callsFake(_.noop);
      sandbox.stub(driver, 'startWda').callsFake(_.noop);
      sandbox.stub(driver, 'installAUT').callsFake(_.noop);
      sandbox.stub(iosDriver.settings, 'setLocale').callsFake(_.noop);
      sandbox.stub(iosDriver.settings, 'setPreferences').callsFake(_.noop);
      sandbox.stub(xcode, 'getMaxIOSSDK').callsFake(async () => '10.0'); // eslint-disable-line require-await
      sandbox.stub(utils, 'checkAppPresent').callsFake(_.noop);
      sandbox.stub(iosDriver.appUtils, 'extractBundleId').callsFake(_.noop);
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should include server capabilities', async function () {
      this.timeout(MOCHA_LONG_TIMEOUT);
      const resCaps = await driver.createSession(caps);
      resCaps[1].javascriptEnabled.should.be.true;
    });

    it('should call startLogCapture', async function () {
      const c = { ... caps };
      Object.assign(c, {skipLogCapture: false});
      this.timeout(MOCHA_LONG_TIMEOUT);
      const resCaps = await driver.createSession(c);
      resCaps[1].javascriptEnabled.should.be.true;
      driver.startLogCapture.called.should.be.true;
    });
    it('should not call startLogCapture', async function () {
      const c = { ... caps };
      Object.assign(c, {skipLogCapture: true});
      this.timeout(MOCHA_LONG_TIMEOUT);
      const resCaps = await driver.createSession(c);
      resCaps[1].javascriptEnabled.should.be.true;
      driver.startLogCapture.called.should.be.false;
    });
  });

  describe('startIWDP()', function () {
    let driver = new XCUITestDriver();

    it('should start and stop IWDP server', async function () {
      let startStub = sinon.stub();
      let stopStub = sinon.stub();
      iosDriver.IWDP = function () {
        this.start = startStub;
        this.stop = stopStub;
      };
      await driver.startIWDP();
      await driver.stopIWDP();

      startStub.calledOnce.should.be.true;
      stopStub.calledOnce.should.be.true;
    });
  });
});
