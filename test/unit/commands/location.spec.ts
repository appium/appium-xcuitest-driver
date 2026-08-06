import assert from 'node:assert/strict';
import {describe, it, afterEach, beforeEach} from 'node:test';

//@ts-expect-error no types
import {services} from 'appium-ios-device';
import sinon from 'sinon';

import {RealDevice} from '../../../lib/device/real-device-management.js';
import {XCUITestDriver} from '../../../lib/driver.js';
import type {XCUITestDriverOpts} from '../../../lib/driver.js';

describe('location commands', function () {
  const udid = '1234';

  let driver: XCUITestDriver;
  let proxySpy: sinon.SinonStub;

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
      proxySpy.withArgs('/wda/device/location', 'GET').resolves({authorizationStatus: 0, latitude: 0, longitude: 0});

      await assert.rejects(driver.getGeoLocation(), /Location service must be/);
    });

    it('should be authorizationStatus === 3', async function () {
      proxySpy.withArgs('/wda/device/location', 'GET').resolves({
        authorizationStatus: 3,
        latitude: -100.395050048828125,
        longitude: 100.09922650538002,
        altitude: 26.267269134521484,
      });

      assert.deepStrictEqual(await driver.getGeoLocation(), {
        altitude: 26.267269134521484,
        latitude: -100.395050048828125,
        longitude: 100.09922650538002,
      });
    });
  });

  describe('setLocation', function () {
    let startSimulateLocationServiceStub: sinon.SinonStub;
    let setLocationStub: sinon.SinonStub;

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
      await assert.rejects(driver.setGeoLocation({}), /latitude should be set/);
    });

    describe('on real device', function () {
      beforeEach(function () {
        driver.opts.udid = udid;
        driver._device = new RealDevice('123', {} as XCUITestDriverOpts);
      });

      it('should use location service to set a location when no platform version', async function () {
        await driver.setGeoLocation({latitude: 1.234, longitude: 2.789});

        assert.strictEqual(startSimulateLocationServiceStub.calledOnce, true);
        assert.strictEqual(startSimulateLocationServiceStub.firstCall.args[0], udid);
        assert.deepStrictEqual(setLocationStub.args[0], [1.234, 2.789]);
      });

      it('should use location service to set a location for lower than platform version 17', async function () {
        driver.opts.platformVersion = '16.4.5';
        await driver.setGeoLocation({latitude: 1.234, longitude: 2.789});

        assert.strictEqual(startSimulateLocationServiceStub.calledOnce, true);
        assert.strictEqual(startSimulateLocationServiceStub.firstCall.args[0], udid);
        assert.deepStrictEqual(setLocationStub.args[0], [1.234, 2.789]);
      });

      it('should use mobileSetSimulatedLocation to set a location for over platform version 17', async function () {
        const locationRequest = {latitude: 1.234, longitude: 2.789};
        driver.opts.platformVersion = '17.0.0';
        proxySpy
          .withArgs('/wda/simulatedLocation', 'POST', locationRequest)
          .resolves({value: null, sessionId: 'session-id'});

        const result = await driver.setGeoLocation(locationRequest);

        assert.strictEqual(startSimulateLocationServiceStub.calledOnce, false);
        assert.strictEqual(proxySpy.firstCall.args[0], '/wda/simulatedLocation');
        assert.strictEqual(proxySpy.firstCall.args[1], 'POST');
        assert.deepStrictEqual(proxySpy.firstCall.args[2], locationRequest);
        assert.deepStrictEqual(result, {latitude: 1.234, longitude: 2.789, altitude: 0});
      });

      it('should use mobileSetSimulatedLocation to set a location for over platform version 17 with exception', async function () {
        const locationRequest = {latitude: 1.234, longitude: 2.789};
        driver.opts.platformVersion = '17.0.0';
        proxySpy.withArgs('/wda/simulatedLocation', 'POST', locationRequest).throws('An error in proxying the request');

        await assert.rejects(driver.setGeoLocation(locationRequest), /An error in proxying the request/);

        assert.strictEqual(startSimulateLocationServiceStub.calledOnce, false);
        assert.strictEqual(proxySpy.firstCall.args[0], '/wda/simulatedLocation');
        assert.strictEqual(proxySpy.firstCall.args[1], 'POST');
        assert.deepStrictEqual(proxySpy.firstCall.args[2], locationRequest);
      });

      it('should use location service to set a location with negative values', async function () {
        await driver.setGeoLocation({latitude: 1.234, longitude: -2});

        assert.strictEqual(startSimulateLocationServiceStub.calledOnce, true);
        assert.strictEqual(startSimulateLocationServiceStub.firstCall.args[0], udid);
        assert.deepStrictEqual(setLocationStub.args[0], [1.234, -2]);
      });
    });

    describe('on simulator', function () {
      let deviceSetLocationSpy: sinon.SinonSpy;
      beforeEach(function () {
        deviceSetLocationSpy = sinon.spy();
        driver._device = {
          simctl: true as any,
          setGeolocation: deviceSetLocationSpy,
        } as any;
      });
      afterEach(function () {
        deviceSetLocationSpy.resetHistory();
      });
      it('should set string coordinates', async function () {
        await driver.setGeoLocation({latitude: '1.234', longitude: '2.789'} as any);
        assert.strictEqual(deviceSetLocationSpy.firstCall.args[0], '1.234');
        assert.strictEqual(deviceSetLocationSpy.firstCall.args[1], '2.789');
      });
      it('should set number coordinates', async function () {
        await driver.setGeoLocation({latitude: 1, longitude: -2});
        assert.strictEqual(deviceSetLocationSpy.firstCall.args[0], '1');
        assert.strictEqual(deviceSetLocationSpy.firstCall.args[1], '-2');
      });
    });
  });
});
