import assert from 'node:assert/strict';
import type {ReadStream} from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {text} from 'node:stream/consumers';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import {fs, tempDir} from 'appium/support.js';
import {createSandbox} from 'sinon';
import type {SinonStub} from 'sinon';

import {AfcClient} from '../../lib/device/afc-client.js';
import {installToRealDevice, pullFolder, pushFolder, RealDevice} from '../../lib/device/real-device-management.js';
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
    sandbox = createSandbox();
    driver = new XCUITestDriver({} as any);
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('nothing happen without app', async function () {
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as SinonStub;
    driver.opts = {udid} as any;
    driver._device = realDevice;

    await installToRealDevice.bind(driver)(undefined as any, bundleId, {});
    assert.strictEqual(removeStub.called, false);
    assert.strictEqual(installStub.called, false);
  });

  it('nothing happen without bundle id', async function () {
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as SinonStub;
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
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as SinonStub;
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
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as SinonStub;
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
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').throws(err_msg) as SinonStub;
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
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as SinonStub;
    const installStub = sandbox
      .stub(realDevice, 'install')
      .onCall(0)
      .throws(
        `{"Error":"MismatchedApplicationIdentifierEntitlement","ErrorDescription":"Upgrade's application-identifier entitlement string (TEAM_ID.com.kazucocoa.example) does not match installed application's application-identifier string (ANOTHER_TEAM_ID.com.kazucocoa.example); rejecting upgrade."}`,
      )
      .onCall(1)
      .resolves() as SinonStub;
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
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').throws(err_msg) as SinonStub;
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
    sandbox = createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  const stubStat = (isFile: boolean) => sandbox.stub(fs, 'stat').resolves({isFile: () => isFile} as any);

  // The AFC + installation_proxy fallback is exercised elsewhere; here we only
  // assert routing, so we short-circuit it with a sentinel rejection from the
  // very first call it makes.
  const stubAfcSentinel = () =>
    sandbox.stub(AfcClient, 'createForDevice').rejects(new Error('afc-sentinel')) as SinonStub;

  const attachAvailableFacade = (realDevice: RealDevice) => {
    realDevice.attachRemoteXPCFacade({
      determineAvailability: sandbox.stub().resolves(true),
    } as unknown as RemoteXPCFacade);
  };

  it('streams an .ipa via zip_conduit on iOS 18+ and skips the AFC path', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '18.0'} as XCUITestDriverOpts);
    attachAvailableFacade(realDevice);
    stubStat(true);
    const installStub = sandbox.stub().resolves();
    const closeStub = sandbox.stub().resolves();
    const createStub = sandbox
      .stub(ZipConduitClient, 'create')
      .resolves({install: installStub, close: closeStub} as any) as SinonStub;
    const afcStub = sandbox.stub(AfcClient, 'createForDevice') as SinonStub;

    await realDevice.install(ipaPath, bundleId);

    assert.strictEqual(createStub.calledOnce, true);
    assert.strictEqual(installStub.calledOnceWith(ipaPath), true);
    assert.strictEqual(closeStub.calledOnce, true);
    assert.strictEqual(afcStub.called, false);
  });

  it('falls back to the legacy AFC path and closes the client when zip_conduit fails', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '18.0'} as XCUITestDriverOpts);
    attachAvailableFacade(realDevice);
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
    stubStat(false);
    const createStub = sandbox.stub(ZipConduitClient, 'create') as SinonStub;
    const afcStub = stubAfcSentinel();

    await assert.rejects(realDevice.install(appDir, bundleId), /afc-sentinel/);
    assert.strictEqual(createStub.called, false);
    assert.strictEqual(afcStub.calledOnce, true);
  });

  it('does not use zip_conduit on iOS < 18', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '17.4'} as XCUITestDriverOpts);
    stubStat(true);
    const createStub = sandbox.stub(ZipConduitClient, 'create') as SinonStub;
    const afcStub = stubAfcSentinel();

    await assert.rejects(realDevice.install(ipaPath, bundleId), /afc-sentinel/);
    assert.strictEqual(createStub.called, false);
    assert.strictEqual(afcStub.calledOnce, true);
  });
});

describe('RealDevice host utility fallback policy', function () {
  const udid = 'test-udid';

  let sandbox: sinon.SinonSandbox;
  let originalPreferDevicectl: string | undefined;

  beforeEach(function () {
    sandbox = createSandbox();
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

describe('pullFolder', function () {
  /** Fake legacy (non-RemoteXPC) AFC service serving a fixed tree rooted at '/'. */
  const createWalkDirService = (tree: Record<string, string[]>) => {
    const walk = async (dir: string, onPath: (p: string, isDirectory: boolean) => unknown): Promise<void> => {
      for (const entry of tree[dir] ?? []) {
        const isDirectory = entry in tree;
        await onPath(entry, isDirectory);
        if (isDirectory) {
          await walk(entry, onPath);
        }
      }
    };
    return {
      getFileInfo: async (p: string) => ({isDirectory: () => p in tree}),
      createReadStream: async (p: string) => Readable.from([`content of ${p}`]),
      walkDir: async (dir: string, _recursive: boolean, onPath: (p: string, isDirectory: boolean) => unknown) =>
        await walk(dir, onPath),
    };
  };

  it('rejects pulling the container root instead of zipping the temp folder parent', async function () {
    const service = createWalkDirService({'/': ['/a.txt', '/sub'], '/sub': ['/sub/b.txt']});
    const client: AfcClient = Reflect.construct(AfcClient, [service, false]);

    await assert.rejects(pullFolder(client, '/'), errors.InvalidArgumentError);
  });

  it('rejects a single-file pull of a remote path without a basename', async function () {
    const client: AfcClient = Reflect.construct(AfcClient, [createWalkDirService({}), false]);

    await assert.rejects(client.pull('/', '/nonexistent/local'), errors.InvalidArgumentError);
  });
});

describe('pushFolder', function () {
  const dstRootPath = 'PublicStaging/com.example.app';
  const tree: [string, boolean][] = [
    ['', true],
    ['a.txt', false],
    ['sub', true],
    ['sub/b.txt', false],
    ['sub/deep', true],
    ['sub/deep/c.txt', false],
  ];

  let sandbox: sinon.SinonSandbox;
  let tmpRoot: string;
  let srcRootPath: string;

  beforeEach(async function () {
    sandbox = createSandbox();
    tmpRoot = await tempDir.openDir();
    srcRootPath = path.join(tmpRoot, 'My.app');
    for (const [relativePath, isDirectory] of tree) {
      const fullPath = path.join(srcRootPath, relativePath);
      if (isDirectory) {
        await fs.mkdirp(fullPath);
      } else {
        await fs.writeFile(fullPath, relativePath);
      }
    }
  });

  afterEach(async function () {
    sandbox.restore();
    await fs.rimraf(tmpRoot);
  });

  /**
   * Pushes the source tree with `fs.glob` resolving to `entries` and records the
   * remote directories created and the local and remote path of each pushed file.
   */
  const pushWithGlobEntries = async (entries: object[]) => {
    const createdDirectories = new Set<string>();
    const pushedFiles: {localPath: string; remotePath: string}[] = [];
    const service = {
      rm: async () => {},
      mkdir: async (remotePath: string) => {
        createdDirectories.add(remotePath);
      },
      writeFromStream: async (remotePath: string, stream: ReadStream) => {
        pushedFiles.push({localPath: String(stream.path), remotePath});
        await text(stream);
      },
    };
    sandbox.stub(fs, 'glob').resolves(entries as any);

    await pushFolder(Reflect.construct(AfcClient, [service, true]), srcRootPath, dstRootPath);

    return {
      createdDirectories: [...createdDirectories],
      pushedFiles: pushedFiles.toSorted((a, b) => a.remotePath.localeCompare(b.remotePath)),
    };
  };

  const assertNestedTreePushed = ({
    createdDirectories,
    pushedFiles,
  }: Awaited<ReturnType<typeof pushWithGlobEntries>>) => {
    assert.deepStrictEqual(createdDirectories, [
      dstRootPath,
      path.join(dstRootPath, 'sub'),
      path.join(dstRootPath, 'sub', 'deep'),
    ]);
    assert.deepStrictEqual(
      pushedFiles,
      ['a.txt', 'sub/b.txt', 'sub/deep/c.txt'].map((relativePath) => ({
        localPath: path.join(srcRootPath, relativePath),
        remotePath: path.join(dstRootPath, relativePath),
      })),
    );
  };

  it('pushes nested folders and files from native fs.glob Dirent entries', async function () {
    const entries = tree.map(([relativePath, isDirectory]) => {
      const fullPath = path.join(srcRootPath, relativePath);
      return {name: path.basename(fullPath), parentPath: path.dirname(fullPath), isDirectory: () => isDirectory};
    });

    assertNestedTreePushed(await pushWithGlobEntries(entries));
  });

  it('pushes nested folders and files from legacy glob entries exposing relative()', async function () {
    const entries = tree.map(([relativePath, isDirectory]) => ({
      relative: () => relativePath,
      isDirectory: () => isDirectory,
    }));

    assertNestedTreePushed(await pushWithGlobEntries(entries));
  });
});
