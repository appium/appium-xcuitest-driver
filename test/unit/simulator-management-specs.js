import { createSim, getExistingSim } from '../../lib/simulator-management.js';
import sinon from 'sinon';
import chai from 'chai';

chai.should();

const caps = {platformName: 'iOS', deviceName: 'iPhone 6', platformVersion: '10.1', app: '/foo.app'};
const simctlModule = require('node-simctl');
const iOSSimulatorModule = require('appium-ios-simulator');

describe('simulator management', function () {
  let getSimulatorStub = sinon.stub(iOSSimulatorModule, 'getSimulator');
  afterEach(function () {
    getSimulatorStub.reset();
  });

  describe('createSim', function () {
    let createDeviceStub = sinon.stub(simctlModule, 'createDevice');

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
    let createDeviceStub = sinon.stub(simctlModule, 'getDevices');

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
});
