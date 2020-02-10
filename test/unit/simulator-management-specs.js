import { createSim, getExistingSim, runSimulatorReset } from '../../lib/simulator-management.js';
import sinon from 'sinon';
import chai from 'chai';
import Simctl from 'node-simctl';

const should = chai.should();

const caps = {platformName: 'iOS', deviceName: 'iPhone 6', platformVersion: '10.1', app: '/foo.app'};
const iOSSimulatorModule = require('appium-ios-simulator');

describe('simulator management', function () {
  let getSimulatorStub = sinon.stub(iOSSimulatorModule, 'getSimulator');
  afterEach(function () {
    getSimulatorStub.reset();
  });

  describe('createSim', function () {
    let createDeviceStub = sinon.stub(Simctl.prototype, 'createDevice');

    afterEach(function () {
      createDeviceStub.reset();
    });

    it('should call appiumTest prefix name', async function () {
      createDeviceStub.returns('dummy-udid');
      getSimulatorStub.returns('dummy-udid');

      await createSim(caps);

      createDeviceStub.calledOnce.should.be.true;
      /appiumTest-[\w-]{36}-iPhone 6/.test(createDeviceStub.firstCall.args[0]).should.be.true;
      createDeviceStub.firstCall.args[1].should.eql('iPhone 6');
      createDeviceStub.firstCall.args[2].should.eql('10.1');
      getSimulatorStub.calledOnce.should.be.true;
      getSimulatorStub.firstCall.args[0].should.eql('dummy-udid');
    });
  });

  describe('getExistingSim', function () {
    let createDeviceStub = sinon.stub(Simctl.prototype, 'getDevices');

    afterEach(function () {
      createDeviceStub.reset();
    });

    it('should call default device name', async function () {
      createDeviceStub.returns([{name: 'iPhone 6', udid: 'dummy-udid'}]);
      getSimulatorStub.returns('dummy-udid');

      await getExistingSim(caps);
      createDeviceStub.calledOnce.should.be.true;
      createDeviceStub.firstCall.args[0].should.eql('10.1');
      getSimulatorStub.calledOnce.should.be.true;
      getSimulatorStub.firstCall.args[0].should.eql('dummy-udid');
    });

    it('should call non-appiumTest prefix name if device has appiumTest prefix and no prefix device name', async function () {
      createDeviceStub.returns([{name: 'appiumTest-iPhone 6', udid: 'appiumTest-dummy-udid'}, {name: 'iPhone 6', udid: 'dummy-udid'}]);
      getSimulatorStub.returns('dummy-udid');

      await getExistingSim(caps);
      createDeviceStub.calledOnce.should.be.true;
      createDeviceStub.firstCall.args[0].should.eql('10.1');
      getSimulatorStub.calledOnce.should.be.true;
      getSimulatorStub.firstCall.args[0].should.eql('dummy-udid');
    });

    it('should call appiumTest prefix device name', async function () {
      createDeviceStub.returns([{name: 'appiumTest-iPhone 6', udid: 'dummy-udid'}]);
      getSimulatorStub.returns('dummy-udid');

      await getExistingSim(caps);
      createDeviceStub.calledOnce.should.be.true;
      createDeviceStub.firstCall.args[0].should.eql('10.1');
      getSimulatorStub.calledOnce.should.be.true;
      getSimulatorStub.firstCall.args[0].should.eql('dummy-udid');
    });

    it('should not exist sim', async function () {
      createDeviceStub.returns();
      getSimulatorStub.returns();

      await getExistingSim(caps);
      createDeviceStub.calledOnce.should.be.true;
      createDeviceStub.firstCall.args[0].should.eql('10.1');
      getSimulatorStub.notCalled.should.be.true;
    });
  });
  describe('runSimulatorReset', function () {
    let result;
    const stoppedDeviceDummy = {
      isRunning: () => false,
      scrubCustomApp: (path, bundleId) => {
        result = {path, bundleId};
      },
      clean: () => {
        result = 'cleaned';
      },
      shutdown: () => {}
    };

    beforeEach(function () {
      result = undefined;
    });

    it('should call scrubCustomApp with fastReset', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: false, fullReset: false
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      result.path.should.eql('');
      result.bundleId.should.eql('io.appium.example');
    });
    it('should return immediately with noReset', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: true, fullReset: false
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      should.equal(result, undefined);
    });
    it('should call clean with fullRest', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: false, fullReset: true
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      result.should.eql('cleaned');
    });
    it('should call scrubCustomApp with fastReset and app', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: false, fullReset: false
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      should.equal(result, undefined);
    });
    it('should return immediately with noReset and app', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: true, fullReset: false
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      should.equal(result, undefined);
    });
    it('should call clean with fullRest and app', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: false, fullReset: true
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      result.should.eql('cleaned');
    });
    it('should not call scrubCustomApp with fastReset, but no bundleid and app', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        noReset: false, fullReset: false
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      should.equal(result, undefined);
    });
  });
});
