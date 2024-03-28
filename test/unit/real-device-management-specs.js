import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {createSandbox} from 'sinon';
import sinonChai from 'sinon-chai';
import { installToRealDevice } from '../../lib/real-device-management';
import RealDevice from '../../lib/real-device';
import XCUITestDriver from '../../lib/driver';

chai.should();
chai.use(sinonChai).use(chaiAsPromised);

const expect = chai.expect;

describe('installToRealDevice', function () {
  const udid = 'test-udid';
  const app = '/path/to.app';
  const bundleId = 'test.bundle.id';

  /** @type {sinon.SinonSandbox} */
  let sandbox;
  let driver;
  beforeEach(function () {
    sandbox = createSandbox();
    driver = new XCUITestDriver();
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('nothing happen without app', async function () {
    const realDevice = new RealDevice(udid);
    sandbox.stub(realDevice, 'remove').resolves();
    sandbox.stub(realDevice, 'install').resolves();
    driver.opts = {udid};
    driver._device = realDevice;

    await installToRealDevice.bind(driver)(undefined, bundleId, {});
    expect(realDevice.remove).to.not.have.been.called;
    expect(realDevice.install).to.not.have.been.called;
  });

  it('nothing happen without bundle id', async function () {
    const realDevice = new RealDevice(udid);
    sandbox.stub(realDevice, 'remove').resolves();
    sandbox.stub(realDevice, 'install').resolves();
    driver._device = realDevice;
    driver.opts = {udid};

    await installToRealDevice.bind(driver)(app, undefined, {});
    expect(realDevice.remove).to.not.have.been.called;
    expect(realDevice.install).to.not.have.been.called;
  });

  it('should install without remove', async function () {
    const opts = {
      skipUninstall: true
    };
    const realDevice = new RealDevice(udid);
    sandbox.stub(realDevice, 'remove').resolves();
    sandbox.stub(realDevice, 'install').resolves();
    driver._device = realDevice;
    driver.opts = {udid};

    await installToRealDevice.bind(driver)(app, bundleId, opts);

    expect(realDevice.remove).to.not.have.been.called;
    expect(realDevice.install).to.have.been.calledOnce;
  });

  it('should install after remove', async function () {
    const opts = {
      skipUninstall: false
    };
    const realDevice = new RealDevice(udid);
    sandbox.stub(realDevice, 'remove').resolves();
    sandbox.stub(realDevice, 'install').resolves();
    driver._device = realDevice;
    driver.opts = {udid};

    await installToRealDevice.bind(driver)(app, bundleId, opts);

    expect(realDevice.remove).to.have.been.calledOnce;
    expect(realDevice.install).to.have.been.calledOnce;
  });

  it('should raise an error for invalid verification error after uninstall', async function () {
    const opts = {
      skipUninstall: false
    };
    const err_msg = `{"Error":"ApplicationVerificationFailed","ErrorDetail":-402620395,"ErrorDescription":"Failed to verify code signature of /path/to.app : 0xe8008015 (A valid provisioning profile for this executable was not found.)"}`;
    const realDevice = new RealDevice(udid);
    sandbox.stub(realDevice, 'remove').resolves();
    sandbox.stub(realDevice, 'install').throws(err_msg);
    driver._device = realDevice;
    driver.opts = {udid};

    await installToRealDevice.bind(driver)(app, bundleId, opts).should.be.rejectedWith('ApplicationVerificationFailed');
    expect(realDevice.remove).to.have.been.calledOnce;
    expect(realDevice.install).to.have.been.calledOnce;
  });

  it('should install after removal once because of MismatchedApplicationIdentifierEntitlement error', async function () {
    // This situation could happen when the app exists as offload, or cached state
    // with different application identifier
    const opts = {
      skipUninstall: true
    };
    const realDevice = new RealDevice(udid);
    sandbox.stub(realDevice, 'remove').resolves();
    sandbox.stub(realDevice, 'install')
      .onCall(0).throws(`{"Error":"MismatchedApplicationIdentifierEntitlement","ErrorDescription":"Upgrade's application-identifier entitlement string (TEAM_ID.com.kazucocoa.example) does not match installed application's application-identifier string (ANOTHER_TEAM_ID.com.kazucocoa.example); rejecting upgrade."}`)
      .onCall(1).resolves();
    driver._device = realDevice;
    driver.opts = {udid};

    await installToRealDevice.bind(driver)(app, bundleId, opts);

    expect(realDevice.remove).to.have.been.calledOnce;
    expect(realDevice.install).to.have.been.calledTwice;
  });

  it('should raise an error in the install ApplicationVerificationFailed error because it is not recoverable', async function () {
    const opts = {
      skipUninstall: true
    };
    const err_msg = `{"Error":"ApplicationVerificationFailed","ErrorDetail":-402620395,"ErrorDescription":"Failed to verify code signature of /path/to.app : 0xe8008015 (A valid provisioning profile for this executable was not found.)"}`;
    const realDevice = new RealDevice(udid);
    sandbox.stub(realDevice, 'remove').resolves();
    sandbox.stub(realDevice, 'install').throws(err_msg);
    sandbox.stub(realDevice, 'isAppInstalled').resolves(true);
    driver._device = realDevice;
    driver.opts = {udid};

    await installToRealDevice.bind(driver)(app, bundleId, opts).should.be.rejectedWith('ApplicationVerificationFailed');
    expect(realDevice.remove).to.not.have.been.called;
    expect(realDevice.install).to.have.been.calledOnce;
  });
});
