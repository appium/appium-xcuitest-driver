import sinon from 'sinon';
import {XCUITestDriver, XCUITestDriverOpts} from '../../../lib/driver';
import {services} from 'appium-ios-device';
import {RealDevice} from '../../../lib/device/real-device-management';
import {expect} from 'chai';

describe('location commands', function () {
  const udid = '1234';

  let driver;
  let proxySpy;

  afterEach(function () {
    proxySpy.reset();
  });

  describe('getGeoLocation', function () {
    beforeEach(function () {
      driver = new XCUITestDriver({} as any);
      proxySpy = sinon.stub(driver, 'proxyCommand');
    });

    afterEach(function () {
      proxySpy.reset();
    });

    it('should be authorizationStatus !== 3', async function () {
      proxySpy
        .withArgs('/wda/device/location', 'GET')
        .resolves({authorizationStatus: 0, latitude: 0, longitude: 0});

      await expect(driver.getGeoLocation()).to.be.rejectedWith('Location service must be');
    });

    it('should be authorizationStatus === 3', async function () {
      proxySpy.withArgs('/wda/device/location', 'GET').resolves({
        authorizationStatus: 3,
        latitude: -100.395050048828125,
        longitude: 100.09922650538002,
        altitude: 26.267269134521484,
      });

      await expect(driver.getGeoLocation()).to.eventually.eql({
        altitude: 26.267269134521484,
        latitude: -100.395050048828125,
        longitude: 100.09922650538002,
      });
    });
  });

  describe('setLocation', function () {
    let startSimulateLocationServiceStub;
    let setLocationStub;

    beforeEach(function () {
      driver = new XCUITestDriver({} as any);
      proxySpy = sinon.stub(driver, 'proxyCommand');
      startSimulateLocationServiceStub = sinon.stub(services, 'startSimulateLocationService');
      const mockService = {setLocation() {}, close() {}};
      setLocationStub = sinon.stub(mockService, 'setLocation');
      startSimulateLocationServiceStub.returns(mockService);
    });

    afterEach(function () {
      driver = new XCUITestDriver({} as any);
      startSimulateLocationServiceStub.restore();
      setLocationStub.restore();
      proxySpy.reset();
    });

    it('should fail when location object is wrong', async function () {
      await expect(driver.setGeoLocation({})).to.be.rejectedWith(
        'Both latitude and longitude should be set',
      );
    });

    describe('on real device', function () {
      beforeEach(function () {
        driver.opts.udid = udid;
        driver._device = new RealDevice('123', {} as XCUITestDriverOpts);
      });

      it('should use location service to set a location when no platform version', async function () {
        await driver.setGeoLocation({latitude: 1.234, longitude: 2.789});

        expect(startSimulateLocationServiceStub.calledOnce).to.be.true;
        expect(startSimulateLocationServiceStub.firstCall.args[0]).to.eql(udid);
        expect(setLocationStub.args[0]).to.eql([1.234, 2.789]);
      });

      it('should use location service to set a location for lower than platform version 17', async function () {
        driver.opts.platformVersion = '16.4.5';
        await driver.setGeoLocation({latitude: 1.234, longitude: 2.789});

        expect(startSimulateLocationServiceStub.calledOnce).to.be.true;
        expect(startSimulateLocationServiceStub.firstCall.args[0]).to.eql(udid);
        expect(setLocationStub.args[0]).to.eql([1.234, 2.789]);
      });

      it('should use mobileSetSimulatedLocation to set a location for over platform version 17', async function () {
        const locationRequest = {latitude: 1.234, longitude: 2.789};
        driver.opts.platformVersion = '17.0.0';
        proxySpy
          .withArgs('/wda/simulatedLocation', 'POST', locationRequest)
          .resolves({value: null, sessionId: 'session-id'});

        const result = await driver.setGeoLocation(locationRequest);

        expect(startSimulateLocationServiceStub.calledOnce).to.be.false;
        expect(proxySpy.firstCall.args[0]).to.eql('/wda/simulatedLocation');
        expect(proxySpy.firstCall.args[1]).to.eql('POST');
        expect(proxySpy.firstCall.args[2]).to.eql(locationRequest);
        expect(result).to.eql({latitude: 1.234, longitude: 2.789, altitude: 0});
      });

      it('should use mobileSetSimulatedLocation to set a location for over platform version 17 with exception', async function () {
        const locationRequest = {latitude: 1.234, longitude: 2.789};
        driver.opts.platformVersion = '17.0.0';
        proxySpy
          .withArgs('/wda/simulatedLocation', 'POST', locationRequest)
          .throws('An error in proxying the request');

        await expect(driver.setGeoLocation(locationRequest)).to.be.rejectedWith(
          'An error in proxying the request',
        );

        expect(startSimulateLocationServiceStub.calledOnce).to.be.false;
        expect(proxySpy.firstCall.args[0]).to.eql('/wda/simulatedLocation');
        expect(proxySpy.firstCall.args[1]).to.eql('POST');
        expect(proxySpy.firstCall.args[2]).to.eql(locationRequest);
      });

      it('should use location service to set a location with negative values', async function () {
        await driver.setGeoLocation({latitude: 1.234, longitude: -2});

        expect(startSimulateLocationServiceStub.calledOnce).to.be.true;
        expect(startSimulateLocationServiceStub.firstCall.args[0]).to.eql(udid);
        expect(setLocationStub.args[0]).to.eql([1.234, -2]);
      });
    });

    describe('on simulator', function () {
      let deviceSetLocationSpy;
      beforeEach(function () {
        deviceSetLocationSpy = sinon.spy();
        driver._device = {
          simctl: true,
          setGeolocation: deviceSetLocationSpy,
        };
      });
      afterEach(function () {
        deviceSetLocationSpy.resetHistory();
      });
      it('should set string coordinates', async function () {
        await driver.setGeoLocation({latitude: '1.234', longitude: '2.789'});
        expect(deviceSetLocationSpy.firstCall.args[0]).to.eql('1.234');
        expect(deviceSetLocationSpy.firstCall.args[1]).to.eql('2.789');
      });
      it('should set number coordinates', async function () {
        await driver.setGeoLocation({latitude: 1, longitude: -2});
        expect(deviceSetLocationSpy.firstCall.args[0]).to.eql('1');
        expect(deviceSetLocationSpy.firstCall.args[1]).to.eql('-2');
      });
    });
  });
});
