import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('increase contrast commands', function () {
  let driver: XCUITestDriver;
  let simulatorSetStub: sinon.SinonStub;
  let simulatorGetStub: sinon.SinonStub;
  let configurationService: {
    getIncreaseContrast: sinon.SinonStub;
    setIncreaseContrast: sinon.SinonStub;
    close: sinon.SinonStub;
  };
  let startConfigurationService: sinon.SinonStub;
  let requireService: sinon.SinonStub;

  beforeEach(function () {
    driver = new XCUITestDriver({} as any);
    simulatorSetStub = sinon.stub().resolves();
    simulatorGetStub = sinon.stub().resolves('enabled');
    driver._device = {
      udid: 'udid',
      setIncreaseContrast: simulatorSetStub,
      getIncreaseContrast: simulatorGetStub,
    } as any;

    configurationService = {
      getIncreaseContrast: sinon.stub().resolves(true),
      setIncreaseContrast: sinon.stub().resolves(),
      close: sinon.stub().resolves(),
    };
    startConfigurationService = sinon.stub().resolves(configurationService);
    requireService = sinon
      .stub()
      .callsFake(async (_feature: string, operation: (services: any) => Promise<any>) =>
        operation({startConfigurationService}),
      );
    Object.defineProperty(driver, 'remoteXPCFacade', {
      value: {requireService},
      configurable: true,
    });
  });

  function asSimulator(): void {
    sinon.stub(driver, 'isSimulator').returns(true);
    sinon.stub(driver, 'isRealDevice').returns(false);
  }

  function asRealDevice(platformVersion = '18.0'): void {
    sinon.stub(driver, 'isSimulator').returns(false);
    sinon.stub(driver, 'isRealDevice').returns(true);
    driver.opts.platformVersion = platformVersion;
  }

  describe('argument validation', function () {
    it('should reject an unknown value before touching any device', async function () {
      asRealDevice();
      await assert.rejects(
        driver.mobileSetIncreaseContrast('bla' as any),
        /expected to be one of enabled,disabled/,
      );
      assert.strictEqual(requireService.notCalled, true);
    });
  });

  describe('simulator', function () {
    beforeEach(function () {
      asSimulator();
    });

    it('should set the value via simctl', async function () {
      await driver.mobileSetIncreaseContrast('enabled');
      assert.strictEqual(simulatorSetStub.calledOnceWithExactly('enabled'), true);
      assert.strictEqual(requireService.notCalled, true);
    });

    it('should get the value via simctl', async function () {
      simulatorGetStub.resolves('disabled');
      assert.strictEqual(await driver.mobileGetIncreaseContrast(), 'disabled');
      assert.strictEqual(requireService.notCalled, true);
    });
  });

  describe('real device', function () {
    it('should translate enabled to a boolean and close the service', async function () {
      asRealDevice();
      await driver.mobileSetIncreaseContrast('enabled');
      assert.strictEqual(startConfigurationService.calledOnceWithExactly('udid'), true);
      assert.strictEqual(configurationService.setIncreaseContrast.calledOnceWithExactly(true), true);
      assert.strictEqual(configurationService.close.calledOnce, true);
      assert.strictEqual(simulatorSetStub.notCalled, true);
    });

    it('should translate disabled to a boolean', async function () {
      asRealDevice();
      await driver.mobileSetIncreaseContrast('disabled');
      assert.strictEqual(configurationService.setIncreaseContrast.calledOnceWithExactly(false), true);
    });

    it('should translate a true reading to enabled', async function () {
      asRealDevice();
      assert.strictEqual(await driver.mobileGetIncreaseContrast(), 'enabled');
      assert.strictEqual(configurationService.close.calledOnce, true);
    });

    it('should translate a false reading to disabled', async function () {
      asRealDevice();
      configurationService.getIncreaseContrast.resolves(false);
      assert.strictEqual(await driver.mobileGetIncreaseContrast(), 'disabled');
    });

    it('should reject below iOS 18 without contacting RemoteXPC', async function () {
      asRealDevice('17.4');
      await assert.rejects(driver.mobileSetIncreaseContrast('enabled'), /requires iOS\/tvOS 18 or newer/);
      assert.strictEqual(requireService.notCalled, true);
    });

    it('should propagate RemoteXPC failures instead of falling back', async function () {
      asRealDevice();
      requireService.rejects(new Error('RemoteXPC tunnel is not available for this session'));
      await assert.rejects(driver.mobileGetIncreaseContrast(), /tunnel is not available/);
      assert.strictEqual(simulatorGetStub.notCalled, true);
    });

    it('should close the service even when the operation fails', async function () {
      asRealDevice();
      configurationService.setIncreaseContrast.rejects(new Error('boom'));
      await assert.rejects(driver.mobileSetIncreaseContrast('enabled'), /boom/);
      assert.strictEqual(configurationService.close.calledOnce, true);
    });
  });
});
