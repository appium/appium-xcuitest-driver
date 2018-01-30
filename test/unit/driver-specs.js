import sinon from 'sinon';
import { settings as iosSettings } from 'appium-ios-driver'; // eslint-disable-line import/no-duplicates
import * as iosDriver from 'appium-ios-driver'; // eslint-disable-line import/no-duplicates
import { JWProxy } from 'appium-base-driver';
import XCUITestDriver from '../..';
import xcode from 'appium-xcode';
import _ from 'lodash';
import chai from 'chai';
import log from '../../lib/logger';
import * as utils from '../../lib/utils';
import { MOCHA_LONG_TIMEOUT } from './helpers';


const caps = {platformName: "iOS", deviceName: "iPhone 6", app: "/foo.app"};
const anoop = async () => {};

describe('driver commands', function () {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxySpy.reset();
  });

  describe('status', function () {
    let d;
    let jwproxyCommandSpy;

    beforeEach(function () {
      d = new XCUITestDriver();
      let fakeProxy = new JWProxy();
      jwproxyCommandSpy = sinon.stub(fakeProxy, "command", async function () {
        return {some: 'thing'};
      });
      d.wda = {jwproxy: fakeProxy};
    });

    afterEach(function () {
      jwproxyCommandSpy.reset();
    });

    it('should not have wda status by default', async function () {
      let status = await d.getStatus();
      jwproxyCommandSpy.calledOnce.should.be.false;
      chai.should().equal(status.wda, undefined);
    });

    it('should return wda status is cached', async function () {
      d.cachedWdaStatus = {};
      let status = await d.getStatus();
      jwproxyCommandSpy.called.should.be.false;
      status.wda.should.exist;
    });
  });

  describe('createSession', function () {
    let d;
    let sandbox;

    beforeEach(function () {
      d = new XCUITestDriver();
      sandbox = sinon.sandbox.create();
      sandbox.stub(d, "determineDevice", async function () {
        return {
          device: {
            shutdown: anoop,
            isRunning () {
              return true;
            },
            stat () {
              return {state: 'Booted'};
            },
            clearCaches: anoop,
          },
          udid: null,
          realDevice: null
        };
      });
      sandbox.stub(d, "configureApp", anoop);
      sandbox.stub(d, "startLogCapture", anoop);
      sandbox.stub(d, "startSim", anoop);
      sandbox.stub(d, "startWdaSession", anoop);
      sandbox.stub(d, "startWda", anoop);
      sandbox.stub(d, "extractBundleId", anoop);
      sandbox.stub(d, "installAUT", anoop);
      sandbox.stub(iosSettings, "setLocale", anoop);
      sandbox.stub(iosSettings, "setPreferences", anoop);
      sandbox.stub(xcode, "getMaxIOSSDK", async function () {
        return '10.0';
      });
      sandbox.stub(utils, "checkAppPresent", anoop);
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should include server capabilities', async function () {
      this.timeout(MOCHA_LONG_TIMEOUT);
      let resCaps = await d.createSession(caps);
      resCaps[1].javascriptEnabled.should.be.true;
    });
    it('should warn', async function () {
      let warnStub = sinon.stub(log, "warn", async function () {});
      await d.createSession(_.defaults({autoAcceptAlerts: true}, caps));
      warnStub.calledOnce.should.be.true;
      _.filter(warnStub.args, (arg) => arg[0].indexOf('autoAcceptAlerts') !== -1)
        .should.have.length(1);
      warnStub.restore();
    });
  });

  describe('startIWDP()', function () {
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
