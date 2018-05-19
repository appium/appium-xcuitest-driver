import { createSim, getExistingSim } from '../../lib/simulator-management.js';
import sinon from 'sinon';
import chai from 'chai';

chai.should();

const caps = {platformName: "iOS", deviceName: "iPhone 6", platformVersion: "10.1", app: "/foo.app"};
const simctlModule = require('node-simctl');
const iOSSimulatorModule = require('appium-ios-simulator');

describe('simulator management', function () {
  let getSimulatorStub = sinon.stub(iOSSimulatorModule, 'getSimulator');
  afterEach(function () {
    getSimulatorStub.reset();
  });

  describe('createSim', function () {
    let createDeviceSpy = sinon.stub(simctlModule, 'createDevice');

    afterEach(function () {
      createDeviceSpy.reset();
    });

    it('should call appiumTest prefix name', async function () {
      createDeviceSpy.returns("dummy-udid");
      getSimulatorStub.returns("dummy-udid");

      await createSim(caps);

      createDeviceSpy.calledOnce.should.be.true;
      createDeviceSpy.firstCall.args[0].should.eql("appiumTest-iPhone 6");
      createDeviceSpy.firstCall.args[1].should.eql("iPhone 6");
      createDeviceSpy.firstCall.args[2].should.eql("10.1");
      getSimulatorStub.calledOnce.should.be.true;
      getSimulatorStub.firstCall.args[0].should.eql("dummy-udid");
    });
  });

  describe('getExistingSim', function () {
    let getDevicesSpy = sinon.stub(simctlModule, 'getDevices');

    afterEach(function () {
      getDevicesSpy.reset();
    });

    it('should call default device name', async function () {
      getDevicesSpy.returns([{name: "iPhone 6", udid: "dummy-udid"}]);
      getSimulatorStub.returns("dummy-udid");

      await getExistingSim(caps);
      getDevicesSpy.calledOnce.should.be.true;
      getDevicesSpy.firstCall.args[0].should.eql("10.1");
      getSimulatorStub.calledOnce.should.be.true;
      getSimulatorStub.firstCall.args[0].should.eql("dummy-udid");
    });

    it('should call appiumTest prefix device name', async function () {
      getDevicesSpy.returns([{name: "appiumTest-iPhone 6", udid: "dummy-udid"}]);
      getSimulatorStub.returns("dummy-udid");

      await getExistingSim(caps);
      getDevicesSpy.calledOnce.should.be.true;
      getDevicesSpy.firstCall.args[0].should.eql("10.1");
      getSimulatorStub.calledOnce.should.be.true;
      getSimulatorStub.firstCall.args[0].should.eql("dummy-udid");
    });

    it('should not exist sim', async function () {
      getDevicesSpy.returns();
      getSimulatorStub.returns();

      await getExistingSim(caps);
      getDevicesSpy.calledOnce.should.be.true;
      getDevicesSpy.firstCall.args[0].should.eql("10.1");
      getSimulatorStub.notCalled.should.be.true;
    });
  });
});
