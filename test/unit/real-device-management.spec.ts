import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {fs, tempDir} from 'appium/support.js';
import sinon from 'sinon';

import {AfcClient} from '../../lib/device/afc-client.js';
import {InstallationProxyClient} from '../../lib/device/installation-proxy-client.js';
import {NotificationClient} from '../../lib/device/notification-client.js';
import {installToRealDevice, pushFolder, RealDevice} from '../../lib/device/real-device-management.js';
import type {RemoteXPCFacade} from '../../lib/device/remote-xpc/index.js';
import {ZipConduitClient} from '../../lib/device/zip-conduit-client.js';
import {XCUITestDriver} from '../../lib/driver.js';
import type {XCUITestDriverOpts} from '../../lib/driver.js';

async function withPlatformAsync(platform: NodeJS.Platform, fn: () => Promise<void>): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {value: platform});
  try {
    await fn();
  } finally {
    if (original) {
      Object.defineProperty(process, 'platform', original);
    }
  }
}

describe('installToRealDevice', function () {
  const udid = 'test-udid';
  const app = '/path/to.app';
  const bundleId = 'test.bundle.id';

  let sandbox: sinon.SinonSandbox;
  let driver: XCUITestDriver;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    driver = new XCUITestDriver({} as any);
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('nothing happen without app', async function () {
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as sinon.SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as sinon.SinonStub;
    driver.opts = {udid} as any;
    driver._device = realDevice;

    await installToRealDevice.bind(driver)(undefined as any, bundleId, {});
    assert.strictEqual(removeStub.called, false);
    assert.strictEqual(installStub.called, false);
  });

  it('nothing happen without bundle id', async function () {
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as sinon.SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as sinon.SinonStub;
    driver._device = realDevice;
    driver.opts = {udid} as any;

    await installToRealDevice.bind(driver)(app, undefined, {});
    assert.strictEqual(removeStub.called, false);
    assert.strictEqual(installStub.called, false);
  });

  it('should install without remove', async function () {
    const opts = {
      skipUninstall: true,
    };
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as sinon.SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as sinon.SinonStub;
    driver._device = realDevice;
    driver.opts = {udid} as any;

    await installToRealDevice.bind(driver)(app, bundleId, opts);

    assert.strictEqual(removeStub.called, false);
    assert.strictEqual(installStub.calledOnce, true);
  });

  it('should install after remove', async function () {
    const opts = {
      skipUninstall: false,
    };
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as sinon.SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as sinon.SinonStub;
    driver._device = realDevice;
    driver.opts = {udid} as any;

    await installToRealDevice.bind(driver)(app, bundleId, opts);

    assert.strictEqual(removeStub.calledOnce, true);
    assert.strictEqual(installStub.calledOnce, true);
  });

  it('should raise an error for invalid verification error after uninstall', async function () {
    const opts = {
      skipUninstall: false,
    };
    const err_msg = `{"Error":"ApplicationVerificationFailed","ErrorDetail":-402620395,"ErrorDescription":"Failed to verify code signature of /path/to.app : 0xe8008015 (A valid provisioning profile for this executable was not found.)"}`;
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as sinon.SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').throws(err_msg) as sinon.SinonStub;
    driver._device = realDevice;
    driver.opts = {udid} as any;

    await assert.rejects(installToRealDevice.bind(driver)(app, bundleId, opts), /ApplicationVerificationFailed/);
    assert.strictEqual(removeStub.calledOnce, true);
    assert.strictEqual(installStub.calledOnce, true);
  });

  it('should install after removal once because of MismatchedApplicationIdentifierEntitlement error', async function () {
    // This situation could happen when the app exists as offload, or cached state
    // with different application identifier
    const opts = {
      skipUninstall: true,
    };
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as sinon.SinonStub;
    const installStub = sandbox
      .stub(realDevice, 'install')
      .onCall(0)
      .throws(
        `{"Error":"MismatchedApplicationIdentifierEntitlement","ErrorDescription":"Upgrade's application-identifier entitlement string (TEAM_ID.com.kazucocoa.example) does not match installed application's application-identifier string (ANOTHER_TEAM_ID.com.kazucocoa.example); rejecting upgrade."}`,
      )
      .onCall(1)
      .resolves() as sinon.SinonStub;
    driver._device = realDevice;
    driver.opts = {udid} as any;

    await installToRealDevice.bind(driver)(app, bundleId, opts);

    assert.strictEqual(removeStub.calledOnce, true);
    assert.strictEqual(installStub.calledTwice, true);
  });

  it('should raise an error in the install ApplicationVerificationFailed error because it is not recoverable', async function () {
    const opts = {
      skipUninstall: true,
    };
    const err_msg = `{"Error":"ApplicationVerificationFailed","ErrorDetail":-402620395,"ErrorDescription":"Failed to verify code signature of /path/to.app : 0xe8008015 (A valid provisioning profile for this executable was not found.)"}`;
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as sinon.SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').throws(err_msg) as sinon.SinonStub;
    sandbox.stub(realDevice, 'isAppInstalled').resolves(true);
    driver._device = realDevice;
    driver.opts = {udid} as any;

    await assert.rejects(installToRealDevice.bind(driver)(app, bundleId, opts), /ApplicationVerificationFailed/);
    assert.strictEqual(removeStub.called, false);
    assert.strictEqual(installStub.calledOnce, true);
  });
});

describe('RealDevice install routing (zip_conduit fast path)', function () {
  const udid = 'test-udid';
  const ipaPath = '/path/to/app.ipa';
  const appDir = '/path/to/app.app';
  const bundleId = 'test.bundle.id';

  let sandbox: sinon.SinonSandbox;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  const stubStat = (isFile: boolean) => sandbox.stub(fs, 'stat').resolves({isFile: () => isFile} as any);

  // The AFC + installation_proxy fallback is exercised elsewhere; here we only
  // assert routing, so we short-circuit it with a sentinel rejection from the
  // very first call it makes.
  const stubAfcSentinel = () =>
    sandbox.stub(AfcClient, 'createForDevice').rejects(new Error('afc-sentinel')) as sinon.SinonStub;

  const attachFacade = (realDevice: RealDevice) => {
    realDevice.attachRemoteXPCFacade({} as unknown as RemoteXPCFacade);
  };

  it('streams an .ipa via zip_conduit and skips the AFC path', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '18.0'} as XCUITestDriverOpts);
    attachFacade(realDevice);
    stubStat(true);
    const installStub = sandbox.stub().resolves();
    const closeStub = sandbox.stub().resolves();
    const createStub = sandbox
      .stub(ZipConduitClient, 'create')
      .resolves({install: installStub, close: closeStub} as any) as sinon.SinonStub;
    const afcStub = sandbox.stub(AfcClient, 'createForDevice') as sinon.SinonStub;

    await realDevice.install(ipaPath, bundleId);

    assert.strictEqual(createStub.calledOnce, true);
    assert.strictEqual(installStub.calledOnceWith(ipaPath), true);
    assert.strictEqual(closeStub.calledOnce, true);
    assert.strictEqual(afcStub.called, false);
  });

  it('falls back to the AFC upload and closes the client when zip_conduit fails', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '18.0'} as XCUITestDriverOpts);
    attachFacade(realDevice);
    stubStat(true);
    const closeStub = sandbox.stub().resolves();
    sandbox.stub(ZipConduitClient, 'create').resolves({
      install: sandbox.stub().rejects(new Error('stream-failed')),
      close: closeStub,
    } as any);
    const afcStub = stubAfcSentinel();

    await assert.rejects(realDevice.install(ipaPath, bundleId), /afc-sentinel/);
    assert.strictEqual(closeStub.calledOnce, true);
    assert.strictEqual(afcStub.calledOnce, true);
  });

  it('does not use zip_conduit for unpacked .app bundles', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '18.0'} as XCUITestDriverOpts);
    attachFacade(realDevice);
    stubStat(false);
    const createStub = sandbox.stub(ZipConduitClient, 'create') as sinon.SinonStub;
    const afcStub = stubAfcSentinel();

    await assert.rejects(realDevice.install(appDir, bundleId), /afc-sentinel/);
    assert.strictEqual(createStub.called, false);
    assert.strictEqual(afcStub.calledOnce, true);
  });

  it('falls back to the AFC upload when zip_conduit is unavailable', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '17.4'} as XCUITestDriverOpts);
    attachFacade(realDevice);
    stubStat(true);
    const createStub = sandbox.stub(ZipConduitClient, 'create').resolves(null) as sinon.SinonStub;
    const afcStub = stubAfcSentinel();

    await assert.rejects(realDevice.install(ipaPath, bundleId), /afc-sentinel/);
    assert.strictEqual(createStub.calledOnce, true);
    assert.strictEqual(afcStub.calledOnce, true);
  });
});

describe('RealDevice host utility fallback policy', function () {
  const udid = 'test-udid';

  let sandbox: sinon.SinonSandbox;
  let originalPreferDevicectl: string | undefined;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    originalPreferDevicectl = process.env.APPIUM_XCUITEST_PREFER_DEVICECTL;
  });

  afterEach(function () {
    sandbox.restore();
    if (originalPreferDevicectl === undefined) {
      delete process.env.APPIUM_XCUITEST_PREFER_DEVICECTL;
    } else {
      process.env.APPIUM_XCUITEST_PREFER_DEVICECTL = originalPreferDevicectl;
    }
  });

  it('does not use devicectl app lookup on non-macOS hosts', async function () {
    await withPlatformAsync('linux', async () => {
      process.env.APPIUM_XCUITEST_PREFER_DEVICECTL = 'true';
      const realDevice = new RealDevice(udid, {
        usePreinstalledWDA: true,
        platformVersion: '18.0',
      } as XCUITestDriverOpts);
      const listAppsStub = sandbox.stub(realDevice.devicectl, 'listApps').resolves([]);
      const fetchAppInfoStub = sandbox.stub(realDevice, 'fetchAppInfo').resolves({
        CFBundleIdentifier: 'test.bundle.id',
      });

      assert.strictEqual(await realDevice.isAppInstalled('test.bundle.id'), true);
      assert.strictEqual(listAppsStub.notCalled, true);
      assert.strictEqual(fetchAppInfoStub.calledOnce, true);
    });
  });
});

describe('RealDevice.installOrUpgradeApplication', function () {
  afterEach(function () {
    sinon.restore();
  });

  it('continues the installation and closes both clients when the notification subscription fails', async function () {
    const realDevice = new RealDevice('test-udid', {platformVersion: '18.0'} as XCUITestDriverOpts);
    realDevice.attachRemoteXPCFacade({} as unknown as RemoteXPCFacade);
    const notificationClose = sinon.stub().resolves();
    const installationClose = sinon.stub().resolves();
    const installApplication = sinon.stub().resolves();
    sinon.stub(NotificationClient, 'create').resolves({
      observe: sinon.stub().rejects(new Error('observe-failed')),
      close: notificationClose,
    } as any);
    sinon.stub(InstallationProxyClient, 'create').resolves({
      installApplication,
      close: installationClose,
    } as any);

    await realDevice.installOrUpgradeApplication('/app', {isUpgrade: false, timeout: 1000});

    assert.strictEqual(installApplication.calledOnce, true);
    assert.strictEqual(notificationClose.calledOnce, true);
    assert.strictEqual(installationClose.calledOnce, true);
  });

  it('closes both clients when the installation fails', async function () {
    const realDevice = new RealDevice('test-udid', {platformVersion: '18.0'} as XCUITestDriverOpts);
    realDevice.attachRemoteXPCFacade({} as unknown as RemoteXPCFacade);
    const notificationClose = sinon.stub().resolves();
    const installationClose = sinon.stub().resolves();
    sinon.stub(NotificationClient, 'create').resolves({
      observe: sinon.stub().resolves(),
      expectNotification: sinon.stub().returns(new Promise(() => {})),
      close: notificationClose,
    } as any);
    sinon.stub(InstallationProxyClient, 'create').resolves({
      installApplication: sinon.stub().rejects(new Error('install-failed')),
      close: installationClose,
    } as any);

    await assert.rejects(
      realDevice.installOrUpgradeApplication('/app', {isUpgrade: false, timeout: 1000}),
      /install-failed/,
    );
    assert.strictEqual(notificationClose.calledOnce, true);
    assert.strictEqual(installationClose.calledOnce, true);
  });
});

describe('pushFolder', function () {
  it('creates the folder structure top-down and pushes larger files first', async function () {
    const root = await tempDir.openDir();
    try {
      await fs.mkdir(path.join(root, 'a', 'b'), {recursive: true});
      await fs.writeFile(path.join(root, 'small.txt'), 'x');
      await fs.writeFile(path.join(root, '.DS_Store'), 'x');
      await fs.mkdir(path.join(root, '.hidden'), {recursive: true});
      await fs.writeFile(path.join(root, '.hidden', 'file'), 'x');
      await fs.writeFile(path.join(root, 'a', 'b', 'big.txt'), 'x'.repeat(100));
      const created: string[] = [];
      const pushed: string[] = [];
      const client = {
        deleteDirectory: async () => {
          throw new Error('OBJECT_NOT_FOUND');
        },
        createDirectory: async (p: string) => void created.push(p),
        writeFromStream: async (p: string, stream: {destroy: () => void}) => {
          pushed.push(p);
          stream.destroy();
        },
      } as unknown as AfcClient;

      await pushFolder(client, root, '/dst');

      assert.deepStrictEqual(created, ['/dst', '/dst/a', '/dst/a/b']);
      assert.deepStrictEqual(pushed, ['/dst/a/b/big.txt', '/dst/small.txt']);
    } finally {
      await fs.rimraf(root);
    }
  });
});
