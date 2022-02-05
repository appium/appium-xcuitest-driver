import sinon from 'sinon';
import { JWProxy } from '@appium/base-driver';
import XCUITestDriver from '../..';
import * as simSettings from '../../lib/simulator-management';
import * as appUtils from '../../lib/app-utils';
import xcode from 'appium-xcode';
import _ from 'lodash';
import chai from 'chai';
import B from 'bluebird';
import * as utils from '../../lib/utils';
import { MOCHA_LONG_TIMEOUT } from './helpers';


chai.should();
const expect = chai.expect;

const caps = {
  fistMatch: [{}],
  alwaysMatch: {
    platformName: 'iOS',
    'appium:deviceName': 'iPhone 6',
    'appium:app': '/foo.app',
    'appium:platformVersion': '10.0',
  }
};


describe('getDefaultUrl', function () {
  let driver;

  beforeEach(function () {
    driver = new XCUITestDriver();
  });

  it('simulator', function () {
    driver.opts.realDevice = true;
    expect(driver.getDefaultUrl()).eq('http://appium.io');
  });

  it('real devicce with ipv4', function () {
    driver.opts.realDevice = false;
    driver.opts.address = '127.0.0.1';
    driver.opts.port = '8080';
    expect(driver.getDefaultUrl()).eq('http://127.0.0.1:8080/welcome');
  });

  it('real devicce with ipv6', function () {
    driver.opts.realDevice = false;
    driver.opts.address = '::1';
    driver.opts.port = '8080';
    expect(driver.getDefaultUrl()).eq('http://[::1]:8080/welcome');
  });
});

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
            getWebInspectorSocket () {
              return '/path/to/uds.socket';
            },
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
      sandbox.stub(driver, 'setReduceMotion').callsFake(_.noop);
      sandbox.stub(driver, 'installAUT').callsFake(_.noop);
      sandbox.stub(driver, 'connectToRemoteDebugger').callsFake(_.noop);
      sandbox.stub(simSettings, 'setLocaleAndPreferences').callsFake(_.noop);
      sandbox.stub(xcode, 'getMaxIOSSDK').callsFake(async () => '10.0'); // eslint-disable-line require-await
      sandbox.stub(utils, 'checkAppPresent').callsFake(_.noop);
      sandbox.stub(appUtils, 'extractBundleId').callsFake(_.noop);
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should include server capabilities', async function () {
      this.timeout(MOCHA_LONG_TIMEOUT);
      const resCaps = await driver.createSession(null, null, _.cloneDeep(caps));
      resCaps[1].javascriptEnabled.should.be.true;
    });

    it('should call startLogCapture', async function () {
      this.timeout(MOCHA_LONG_TIMEOUT);
      const resCaps = await driver.createSession(null, null, _.merge({}, caps, {
        alwaysMatch: {
          'appium:skipLogCapture': false,
        }
      }));
      resCaps[1].javascriptEnabled.should.be.true;
      driver.startLogCapture.called.should.be.true;
    });
    it('should not call startLogCapture', async function () {
      this.timeout(MOCHA_LONG_TIMEOUT);
      const resCaps = await driver.createSession(null, null, _.merge({}, caps, {
        alwaysMatch: {
          'appium:skipLogCapture': true,
        }
      }));
      resCaps[1].javascriptEnabled.should.be.true;
      driver.startLogCapture.called.should.be.false;
    });
  });
});

describe('installOtherApps', function () {
  let driver = new XCUITestDriver();
  let sandbox;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should skip install other apps on real devices', async function () {
    sandbox.stub(driver, 'isRealDevice');
    sandbox.stub(driver.helpers, 'parseCapsArray');
    driver.isRealDevice.returns(true);
    await driver.installOtherApps('/path/to/iosApp.app');
    driver.isRealDevice.calledOnce.should.be.true;
    driver.helpers.parseCapsArray.notCalled.should.be.true;
  });

  it('should install multiple apps from otherApps as string on simulators', async function () {
    const SimulatorManagementModule = require('../../lib/simulator-management');
    sandbox.stub(SimulatorManagementModule, 'installToSimulator');
    sandbox.stub(driver, 'isRealDevice');
    driver.isRealDevice.returns(false);
    sandbox.stub(driver.helpers, 'configureApp');
    driver.helpers.configureApp.returns(B.resolve('/path/to/iosApp.app'));
    driver.opts.noReset = false;
    driver.opts.device = 'some-device';
    driver.lifecycleData = {createSim: false};
    await driver.installOtherApps('/path/to/iosApp.app');
    driver.isRealDevice.calledOnce.should.be.true;
    driver.helpers.configureApp.calledOnce.should.be.true;
    SimulatorManagementModule.installToSimulator.calledOnce.should.be.true;
    SimulatorManagementModule.installToSimulator.calledWith(
      'some-device',
      '/path/to/iosApp.app',
      undefined, {noReset: false, newSimulator: false}
    ).should.be.true;
  });

  it('should install multiple apps from otherApps as JSON array on simulators', async function () {
    const SimulatorManagementModule = require('../../lib/simulator-management');
    sandbox.stub(SimulatorManagementModule, 'installToSimulator');
    sandbox.stub(driver, 'isRealDevice');
    driver.isRealDevice.returns(false);
    sandbox.stub(driver.helpers, 'configureApp');
    driver.helpers.configureApp.onCall(0).returns(B.resolve('/path/to/iosApp1.app'));
    driver.helpers.configureApp.onCall(1).returns(B.resolve('/path/to/iosApp2.app'));
    driver.opts.noReset = false;
    driver.opts.device = 'some-device';
    driver.lifecycleData = {createSim: false};
    await driver.installOtherApps('["/path/to/iosApp1.app","/path/to/iosApp2.app"]');
    driver.isRealDevice.calledOnce.should.be.true;
    driver.helpers.configureApp.calledTwice.should.be.true;
    SimulatorManagementModule.installToSimulator.calledWith(
      'some-device',
      '/path/to/iosApp1.app',
      undefined, {noReset: false, newSimulator: false}
    ).should.be.true;
    SimulatorManagementModule.installToSimulator.calledWith(
      'some-device',
      '/path/to/iosApp2.app',
      undefined, {noReset: false, newSimulator: false}
    ).should.be.true;
  });
});
