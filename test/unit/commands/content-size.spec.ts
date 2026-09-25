import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

/** The sizes `appium-ios-remotexpc` accepts through its typed `setDeviceTextSize` helper. */
const REMOTE_XPC_SIZES = [
  'extraSmall',
  'small',
  'medium',
  'large',
  'extraLarge',
  'extraExtraLarge',
  'extraExtraExtraLarge',
];

describe('content size commands', function () {
  let driver: XCUITestDriver;
  let simulatorSetStub: sinon.SinonStub;
  let simulatorGetStub: sinon.SinonStub;
  let configurationService: {
    getDeviceTextSize: sinon.SinonStub;
    setDeviceTextSize: sinon.SinonStub;
    action: sinon.SinonStub;
    close: sinon.SinonStub;
  };
  let startConfigurationService: sinon.SinonStub;
  let requireService: sinon.SinonStub;

  beforeEach(function () {
    driver = new XCUITestDriver({} as any);
    simulatorSetStub = sinon.stub().resolves();
    simulatorGetStub = sinon.stub().resolves('large');
    driver._device = {
      udid: 'udid',
      setContentSize: simulatorSetStub,
      getContentSize: simulatorGetStub,
    } as any;

    configurationService = {
      getDeviceTextSize: sinon.stub().resolves('medium'),
      // Mirrors appium-ios-remotexpc: it validates against its own seven-name list and throws a
      // TypeError before sending anything, which is what makes the client fall back to `action`.
      setDeviceTextSize: sinon.stub().callsFake(async (size: string) => {
        if (!REMOTE_XPC_SIZES.includes(size)) {
          throw new TypeError(`size must be one of ${REMOTE_XPC_SIZES.join(', ')}, got '${size}'`);
        }
      }),
      action: sinon.stub().resolves({}),
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
    it('should reject an unknown size before touching any device', async function () {
      asRealDevice();
      await assert.rejects(driver.mobileSetContentSize('huge' as any), /expected to be one of extra-small/);
      assert.strictEqual(requireService.notCalled, true);
    });
  });

  describe('simulator', function () {
    beforeEach(function () {
      asSimulator();
    });

    it('should set the size via simctl', async function () {
      await driver.mobileSetContentSize('accessibility-large');
      assert.strictEqual(simulatorSetStub.calledOnceWithExactly('accessibility-large'), true);
      assert.strictEqual(requireService.notCalled, true);
    });

    it('should get the size via simctl', async function () {
      assert.strictEqual(await driver.mobileGetContentSize(), 'large');
      assert.strictEqual(requireService.notCalled, true);
    });
  });

  describe('real device', function () {
    it('should translate a kebab-case size to the CoreDevice spelling', async function () {
      asRealDevice();
      await driver.mobileSetContentSize('extra-extra-large');
      assert.strictEqual(startConfigurationService.calledOnceWithExactly('udid'), true);
      assert.strictEqual(configurationService.setDeviceTextSize.calledOnceWithExactly('extraExtraLarge'), true);
      assert.strictEqual(configurationService.close.calledOnce, true);
      assert.strictEqual(simulatorSetStub.notCalled, true);
    });

    it('should translate a CoreDevice reading back to kebab-case', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves('extraExtraExtraLarge');
      assert.strictEqual(await driver.mobileGetContentSize(), 'extra-extra-extra-large');
    });

    it('should report the canonical lowercase spelling, unlike simctl', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves('extraSmall');
      assert.strictEqual(await driver.mobileGetContentSize(), 'extra-small');
      configurationService.getDeviceTextSize.resolves('small');
      assert.strictEqual(await driver.mobileGetContentSize(), 'small');
    });

    it('should still step correctly from a capitalised size', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves('extraSmall');
      await driver.mobileSetContentSize('increment');
      assert.strictEqual(configurationService.setDeviceTextSize.calledOnceWithExactly('small'), true);
    });

    it('should report unknown when the device reports no size', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves(undefined);
      assert.strictEqual(await driver.mobileGetContentSize(), 'unknown');
    });

    it('should report unknown for a size this driver does not know', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves('someFutureSize');
      assert.strictEqual(await driver.mobileGetContentSize(), 'unknown');
    });

    it('should set accessibility sizes through the underlying action', async function () {
      asRealDevice();
      await driver.mobileSetContentSize('accessibility-large');
      // The typed helper is tried first and throws; the raw action then carries the same payload.
      assert.strictEqual(configurationService.setDeviceTextSize.calledOnceWithExactly('accessibilityLarge'), true);
      assert.strictEqual(configurationService.action.calledOnce, true);
      assert.deepStrictEqual(configurationService.action.firstCall.args, [
        'com.apple.coredevice.action.setdevicetextsize',
        {textSize: {size: {accessibilityLarge: {}}}},
      ]);
    });

    it('should translate an accessibility size reading back to kebab-case', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves('accessibilityExtraExtraLarge');
      assert.strictEqual(await driver.mobileGetContentSize(), 'accessibility-extra-extra-large');
    });

    it('should step from the standard range into the accessibility range', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves('extraExtraExtraLarge');
      await driver.mobileSetContentSize('increment');
      assert.strictEqual(configurationService.action.calledOnce, true);
      assert.deepStrictEqual(configurationService.action.firstCall.args[1], {
        textSize: {size: {accessibilityMedium: {}}},
      });
    });

    it('should step up one size on increment', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves('medium');
      await driver.mobileSetContentSize('increment');
      assert.strictEqual(configurationService.setDeviceTextSize.calledOnceWithExactly('large'), true);
    });

    it('should step down one size on decrement', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves('large');
      await driver.mobileSetContentSize('decrement');
      assert.strictEqual(configurationService.setDeviceTextSize.calledOnceWithExactly('medium'), true);
    });

    it('should do nothing when incrementing past the largest size', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves('accessibilityExtraExtraExtraLarge');
      await driver.mobileSetContentSize('increment');
      assert.strictEqual(configurationService.setDeviceTextSize.notCalled, true);
      assert.strictEqual(configurationService.action.notCalled, true);
    });

    it('should do nothing when decrementing past the smallest size', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves('extraSmall');
      await driver.mobileSetContentSize('decrement');
      assert.strictEqual(configurationService.setDeviceTextSize.notCalled, true);
    });

    it('should fail to step from a size it cannot place', async function () {
      asRealDevice();
      configurationService.getDeviceTextSize.resolves(undefined);
      await assert.rejects(driver.mobileSetContentSize('increment'), /Cannot increment the content size/);
      assert.strictEqual(configurationService.setDeviceTextSize.notCalled, true);
    });

    it('should reject below iOS 18 without contacting RemoteXPC', async function () {
      asRealDevice('17.4');
      await assert.rejects(driver.mobileSetContentSize('large'), /requires iOS\/tvOS 18 or newer/);
      assert.strictEqual(requireService.notCalled, true);
    });

    it('should propagate RemoteXPC failures instead of falling back', async function () {
      asRealDevice();
      requireService.rejects(new Error('RemoteXPC tunnel is not available for this session'));
      await assert.rejects(driver.mobileGetContentSize(), /tunnel is not available/);
      assert.strictEqual(simulatorGetStub.notCalled, true);
    });

    it('should close the service even when the operation fails', async function () {
      asRealDevice();
      configurationService.setDeviceTextSize.rejects(new Error('boom'));
      await assert.rejects(driver.mobileSetContentSize('large'), /boom/);
      assert.strictEqual(configurationService.close.calledOnce, true);
    });
  });
});
