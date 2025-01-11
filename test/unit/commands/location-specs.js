import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import {services} from 'appium-ios-device';
import {RealDevice} from '../../../lib/real-device';

describe('location commands', function () {
  const udid = '1234';

  let driver;
  let proxySpy;

  afterEach(function () {
    proxySpy.reset();
  });

  describe('getGeoLocation', function () {
    beforeEach(function () {
      driver = new XCUITestDriver();
      proxySpy = sinon.stub(driver, 'proxyCommand');
    });

    afterEach(function () {
      proxySpy.reset();
    });

    it('should be authorizationStatus !== 3', async function () {
      proxySpy
        .withArgs('/wda/device/location', 'GET')
        .resolves({authorizationStatus: 0, latitude: 0, longitude: 0});

      await driver.getGeoLocation().should.be.rejectedWith('Location service must be');
    });

    it('should be authorizationStatus === 3', async function () {
      proxySpy.withArgs('/wda/device/location', 'GET').resolves({
        authorizationStatus: 3,
        latitude: -100.395050048828125,
        longitude: 100.09922650538002,
        altitude: 26.267269134521484,
      });

      await driver.getGeoLocation().should.eventually.eql({
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
      driver = new XCUITestDriver();
      proxySpy = sinon.stub(driver, 'proxyCommand');
      startSimulateLocationServiceStub = sinon.stub(services, 'startSimulateLocationService');
      let mockService = {setLocation() {}, close() {}};
      setLocationStub = sinon.stub(mockService, 'setLocation');
      startSimulateLocationServiceStub.returns(mockService);
    });

    afterEach(function () {
      driver = new XCUITestDriver();
      startSimulateLocationServiceStub.restore();
      setLocationStub.restore();
      proxySpy.reset();
    });

    it('should fail when location object is wrong', async function () {
      await driver
        .setGeoLocation({})
        .should.be.rejectedWith('Both latitude and longitude should be set');
    });

    describe('on real device', function () {
      beforeEach(function () {
        driver.opts.udid = udid;
        driver._device = new RealDevice('123');
      });

      it('should use location service to set a location when no platform version', async function () {
        await driver.setGeoLocation({latitude: 1.234, longitude: 2.789});

        startSimulateLocationServiceStub.calledOnce.should.be.true;
        startSimulateLocationServiceStub.firstCall.args[0].should.eql(udid);
        setLocationStub.args[0].should.eql([1.234, 2.789]);
      });


      it('should use location service to set a location for lower than platform version 17', async function () {
        driver.opts.platformVersion = '16.4.5';
        await driver.setGeoLocation({latitude: 1.234, longitude: 2.789});

        startSimulateLocationServiceStub.calledOnce.should.be.true;
        startSimulateLocationServiceStub.firstCall.args[0].should.eql(udid);
        setLocationStub.args[0].should.eql([1.234, 2.789]);
      });

      it('should use mobileSetSimulatedLocation to set a location for over platform version 17', async function () {
        const locationRequest = {latitude: 1.234, longitude: 2.789};
        driver.opts.platformVersion = '17.0.0';
        proxySpy
          .withArgs('/wda/simulatedLocation', 'POST', locationRequest)
          .resolves({'value': null, 'sessionId': 'session-id'});

        const result = await driver.setGeoLocation(locationRequest);

        startSimulateLocationServiceStub.calledOnce.should.be.false;
        proxySpy.firstCall.args[0].should.eql('/wda/simulatedLocation');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.eql(locationRequest);
        result.should.eql({latitude: 1.234, longitude: 2.789, altitude: 0});
      });

      it('should use mobileSetSimulatedLocation to set a location for over platform version 17 with exception', async function () {
        const locationRequest = {latitude: 1.234, longitude: 2.789};
        driver.opts.platformVersion = '17.0.0';
        proxySpy
          .withArgs('/wda/simulatedLocation', 'POST', locationRequest)
          .throws('An error in proxying the request');

        await driver.setGeoLocation(locationRequest).should.be.rejectedWith('An error in proxying the request');

        startSimulateLocationServiceStub.calledOnce.should.be.false;
        proxySpy.firstCall.args[0].should.eql('/wda/simulatedLocation');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.eql(locationRequest);
      });

      it('should use location service to set a location with negative values', async function () {
        await driver.setGeoLocation({latitude: 1.234, longitude: -2});

        startSimulateLocationServiceStub.calledOnce.should.be.true;
        startSimulateLocationServiceStub.firstCall.args[0].should.eql(udid);
        setLocationStub.args[0].should.eql([1.234, -2]);
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
        deviceSetLocationSpy.firstCall.args[0].should.eql('1.234');
        deviceSetLocationSpy.firstCall.args[1].should.eql('2.789');
      });
      it('should set number coordinates', async function () {
        await driver.setGeoLocation({latitude: 1, longitude: -2});
        deviceSetLocationSpy.firstCall.args[0].should.eql('1');
        deviceSetLocationSpy.firstCall.args[1].should.eql('-2');
      });
    });
  });
});
