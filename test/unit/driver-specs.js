import sinon from 'sinon';
import { settings as iosSettings } from 'appium-ios-driver';
import { JWProxy } from 'appium-base-driver';
import XCUITestDriver from '../..';
import xcode from 'appium-xcode';
import _ from 'lodash';
import chai from 'chai';
import log from '../../lib/logger';
import * as utils from '../../lib/utils';


const caps = {platformName: "iOS", deviceName: "iPhone 6", app: "/foo.app"};
const anoop = async () => {};

describe('driver commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('status caching', () => {
    let d;
    let jwproxyCommandSpy;

    beforeEach(() => {
      d = new XCUITestDriver();
      let fakeProxy = new JWProxy();
      jwproxyCommandSpy = sinon.stub(fakeProxy, "command", async () => {
        return {some: 'thing'};
      });
      d.wda = {jwproxy: fakeProxy};
    });

    afterEach(() => {
      jwproxyCommandSpy.reset();
    });

    it('wda status is not present by default', async () => {
      let status = await d.getStatus();
      jwproxyCommandSpy.calledOnce.should.be.false;
      chai.should().equal(status.wda, undefined);
    });

    it('should cache wda status', async () => {
      d.proxyCommand('/status', 'GET');
      let status = await d.getStatus();
      jwproxyCommandSpy.calledOnce.should.be.true;
      jwproxyCommandSpy.calledTwice.should.be.false;
      status.wda.should.exist;
    });
  });

  describe('createSession', () => {
    let d;
    let sandbox;

    beforeEach(() => {
      d = new XCUITestDriver();
      sandbox = sinon.sandbox.create();
      sandbox.stub(d, "determineDevice", async () => {
        return {
          device: {
            shutdown: anoop,
            stat () {
              return {state: 'Booted'};
            }
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
      sandbox.stub(d, "installApp", anoop);
      sandbox.stub(iosSettings, "setLocale", anoop);
      sandbox.stub(iosSettings, "setPreferences", anoop);
      sandbox.stub(xcode, "getMaxIOSSDK", async () => {
        return '10.0';
      });
      sandbox.stub(utils, "checkAppPresent", anoop);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should include server capabilities', async () => {
      let resCaps = await d.createSession(caps);
      resCaps[1].javascriptEnabled.should.be.true;
    });
    it('should warn', async () => {
      let warnStub = sinon.stub(log, "warn", async () => {});
      await d.createSession(_.defaults({autoAcceptAlerts: true}, caps));
      warnStub.calledTwice.should.be.true;
      _.filter(warnStub.args, (arg) => arg[0].indexOf('autoAcceptAlerts') !== -1)
        .should.have.length(1);
      warnStub.restore();
    });
  });
});

