import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import {createSandbox} from 'sinon';
import sinonChai from 'sinon-chai';
import { installToRealDevice } from '../../lib/real-device-management';
import IOSDeploy from '../../lib/ios-deploy';

chai.should();
chai.use(sinonChai).use(chaiAsPromised);

const expect = chai.expect;

describe('installToRealDevice', function () {
  const udid = 'test-udid';
  const app = '/path/to.app';
  const bundleId = 'test.bundle.id';

  /** @type {sinon.SinonSandbox} */
  let sandbox;
  beforeEach(function () {
    sandbox = createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should install without remove', async function () {
    const opts = {
      skipUninstall: true
    };
    const iosDeploy = new IOSDeploy(udid);
    sandbox.stub(iosDeploy, 'remove').returns(null);
    sandbox.stub(iosDeploy, 'install').returns(null);

    await installToRealDevice(iosDeploy, app, bundleId, opts);

    expect(iosDeploy.remove).to.not.have.been.called;
    expect(iosDeploy.install).to.have.been.calledOnce;
  });

  it('should install after remove', async function () {
    const opts = {
      skipUninstall: false
    };
    const iosDeploy = new IOSDeploy(udid);
    sandbox.stub(iosDeploy, 'remove').returns(null);
    sandbox.stub(iosDeploy, 'install').returns(null);

    await installToRealDevice(iosDeploy, app, bundleId, opts);

    expect(iosDeploy.remove).to.have.been.calledOnce;
    expect(iosDeploy.install).to.have.been.calledOnce;
  });

  it('should raise an error for invalid verification error after uninstall', async function () {
    const opts = {
      skipUninstall: false
    };
    const err_msg = `{"Error":"ApplicationVerificationFailed","ErrorDetail":-402620395,"ErrorDescription":"Failed to verify code signature of /path/to.app : 0xe8008015 (A valid provisioning profile for this executable was not found.)"}`;
    const iosDeploy = new IOSDeploy(udid);
    sandbox.stub(iosDeploy, 'remove').returns(null);
    sandbox.stub(iosDeploy, 'install').throws(err_msg);

    await installToRealDevice(iosDeploy, app, bundleId, opts).should.be.rejectedWith('ApplicationVerificationFailed');
    expect(iosDeploy.remove).to.have.been.calledOnce;
    expect(iosDeploy.install).to.have.been.calledOnce;
  });

  it('should raise an error in the install MismatchedApplicationIdentifierEntitlement error because it does not require enforce uninstallation', async function () {
    const opts = {
      skipUninstall: true,
      shouldEnforceUninstall: false
    };
    const err_msg = `{"Error":"MismatchedApplicationIdentifierEntitlement","ErrorDescription":"Upgrade's application-identifier entitlement string (TEAM_ID.com.kazucocoa.example) does not match installed application's application-identifier string (ANOTHER_TEAM_ID.com.kazucocoa.example); rejecting upgrade."}`;
    const iosDeploy = new IOSDeploy(udid);
    sandbox.stub(iosDeploy, 'remove').returns(null);
    sandbox.stub(iosDeploy, 'install').throws(err_msg);

    await installToRealDevice(iosDeploy, app, bundleId, opts).should.be.rejectedWith('MismatchedApplicationIdentifierEntitlement');
    expect(iosDeploy.remove).to.not.have.been.called;
    expect(iosDeploy.install).to.have.been.calledOnce;
  });

  it('should install after removal once because of MismatchedApplicationIdentifierEntitlement error', async function () {
    // This situation could happen when the app exists as offload, or cached state
    // with different application identifier
    const opts = {
      skipUninstall: true,
      shouldEnforceUninstall: true
    };
    const iosDeploy = new IOSDeploy(udid);
    sandbox.stub(iosDeploy, 'remove').returns(null);
    sandbox.stub(iosDeploy, 'install')
      .onCall(0).throws(`{"Error":"MismatchedApplicationIdentifierEntitlement","ErrorDescription":"Upgrade's application-identifier entitlement string (TEAM_ID.com.kazucocoa.example) does not match installed application's application-identifier string (ANOTHER_TEAM_ID.com.kazucocoa.example); rejecting upgrade."}`)
      .onCall(1).returns(null);

    await installToRealDevice(iosDeploy, app, bundleId, opts);

    expect(iosDeploy.remove).to.have.been.calledOnce;
    expect(iosDeploy.install).to.have.been.calledTwice;
  });

  it('should raise an error in the install ApplicationVerificationFailed error because it is not recoverable', async function () {
    const opts = {
      skipUninstall: true,
      shouldEnforceUninstall: true
    };
    const err_msg = `{"Error":"ApplicationVerificationFailed","ErrorDetail":-402620395,"ErrorDescription":"Failed to verify code signature of /path/to.app : 0xe8008015 (A valid provisioning profile for this executable was not found.)"}`;
    const iosDeploy = new IOSDeploy(udid);
    sandbox.stub(iosDeploy, 'remove').returns(null);
    sandbox.stub(iosDeploy, 'install').throws(err_msg);
    sandbox.stub(iosDeploy, 'isAppInstalled').resolves(true);

    await installToRealDevice(iosDeploy, app, bundleId, opts).should.be.rejectedWith('ApplicationVerificationFailed');
    expect(iosDeploy.remove).to.not.have.been.called;
    expect(iosDeploy.install).to.have.been.calledOnce;
  });
});
