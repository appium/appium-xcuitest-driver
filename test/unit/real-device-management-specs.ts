import {createSandbox} from 'sinon';
import {fs} from 'appium/support';
import {installToRealDevice, RealDevice} from '../../lib/device/real-device-management';
import {AfcClient} from '../../lib/device/afc-client';
import {ZipConduitClient} from '../../lib/device/zip-conduit-client';
import {XCUITestDriver} from '../../lib/driver';
import type {XCUITestDriverOpts} from '../../lib/driver';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import type {SinonStub} from 'sinon';

chai.use(chaiAsPromised);

describe('installToRealDevice', function () {
  const udid = 'test-udid';
  const app = '/path/to.app';
  const bundleId = 'test.bundle.id';

  let sandbox;
  let driver;

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
    driver.opts = {udid};
    driver._device = realDevice;

    await installToRealDevice.bind(driver)(undefined, bundleId, {});
    expect(removeStub.called).to.be.false;
    expect(installStub.called).to.be.false;
  });

  it('nothing happen without bundle id', async function () {
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as SinonStub;
    driver._device = realDevice;
    driver.opts = {udid};

    await installToRealDevice.bind(driver)(app, undefined, {});
    expect(removeStub.called).to.be.false;
    expect(installStub.called).to.be.false;
  });

  it('should install without remove', async function () {
    const opts = {
      skipUninstall: true,
    };
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as SinonStub;
    driver._device = realDevice;
    driver.opts = {udid};

    await installToRealDevice.bind(driver)(app, bundleId, opts);

    expect(removeStub.called).to.be.false;
    expect(installStub.calledOnce).to.be.true;
  });

  it('should install after remove', async function () {
    const opts = {
      skipUninstall: false,
    };
    const realDevice = new RealDevice(udid, {} as XCUITestDriverOpts);
    const removeStub = sandbox.stub(realDevice, 'remove').resolves() as SinonStub;
    const installStub = sandbox.stub(realDevice, 'install').resolves() as SinonStub;
    driver._device = realDevice;
    driver.opts = {udid};

    await installToRealDevice.bind(driver)(app, bundleId, opts);

    expect(removeStub.calledOnce).to.be.true;
    expect(installStub.calledOnce).to.be.true;
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
    driver.opts = {udid};

    await expect(installToRealDevice.bind(driver)(app, bundleId, opts)).to.be.rejectedWith(
      'ApplicationVerificationFailed',
    );
    expect(removeStub.calledOnce).to.be.true;
    expect(installStub.calledOnce).to.be.true;
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
    driver.opts = {udid};

    await installToRealDevice.bind(driver)(app, bundleId, opts);

    expect(removeStub.calledOnce).to.be.true;
    expect(installStub.calledTwice).to.be.true;
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
    driver.opts = {udid};

    await expect(installToRealDevice.bind(driver)(app, bundleId, opts)).to.be.rejectedWith(
      'ApplicationVerificationFailed',
    );
    expect(removeStub.called).to.be.false;
    expect(installStub.calledOnce).to.be.true;
  });
});

describe('RealDevice install routing (zip_conduit fast path)', function () {
  const udid = 'test-udid';
  const ipaPath = '/path/to/app.ipa';
  const appDir = '/path/to/app.app';
  const bundleId = 'test.bundle.id';

  let sandbox;

  beforeEach(function () {
    sandbox = createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  const stubStat = (isFile: boolean) =>
    sandbox.stub(fs, 'stat').resolves({isFile: () => isFile} as any);

  // The AFC + installation_proxy fallback is exercised elsewhere; here we only
  // assert routing, so we short-circuit it with a sentinel rejection from the
  // very first call it makes.
  const stubAfcSentinel = () =>
    sandbox.stub(AfcClient, 'createForDevice').rejects(new Error('afc-sentinel')) as SinonStub;

  it('streams an .ipa via zip_conduit on iOS 18+ and skips the AFC path', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '18.0'} as XCUITestDriverOpts);
    stubStat(true);
    const installStub = sandbox.stub().resolves();
    const closeStub = sandbox.stub().resolves();
    const createStub = sandbox
      .stub(ZipConduitClient, 'create')
      .resolves({install: installStub, close: closeStub} as any) as SinonStub;
    const afcStub = sandbox.stub(AfcClient, 'createForDevice') as SinonStub;

    await realDevice.install(ipaPath, bundleId);

    expect(createStub.calledOnce).to.be.true;
    expect(installStub.calledOnceWith(ipaPath)).to.be.true;
    expect(closeStub.calledOnce).to.be.true;
    expect(afcStub.called).to.be.false;
  });

  it('falls back to the legacy AFC path and closes the client when zip_conduit fails', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '18.0'} as XCUITestDriverOpts);
    stubStat(true);
    const closeStub = sandbox.stub().resolves();
    sandbox.stub(ZipConduitClient, 'create').resolves({
      install: sandbox.stub().rejects(new Error('stream-failed')),
      close: closeStub,
    } as any);
    const afcStub = stubAfcSentinel();

    await expect(realDevice.install(ipaPath, bundleId)).to.be.rejectedWith(/afc-sentinel/);
    expect(closeStub.calledOnce).to.be.true;
    expect(afcStub.calledOnce).to.be.true;
  });

  it('does not use zip_conduit for unpacked .app bundles', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '18.0'} as XCUITestDriverOpts);
    stubStat(false);
    const createStub = sandbox.stub(ZipConduitClient, 'create') as SinonStub;
    const afcStub = stubAfcSentinel();

    await expect(realDevice.install(appDir, bundleId)).to.be.rejectedWith(/afc-sentinel/);
    expect(createStub.called).to.be.false;
    expect(afcStub.calledOnce).to.be.true;
  });

  it('does not use zip_conduit on iOS < 18', async function () {
    const realDevice = new RealDevice(udid, {platformVersion: '17.4'} as XCUITestDriverOpts);
    stubStat(true);
    const createStub = sandbox.stub(ZipConduitClient, 'create') as SinonStub;
    const afcStub = stubAfcSentinel();

    await expect(realDevice.install(ipaPath, bundleId)).to.be.rejectedWith(/afc-sentinel/);
    expect(createStub.called).to.be.false;
    expect(afcStub.calledOnce).to.be.true;
  });
});
