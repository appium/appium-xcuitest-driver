import {XctestAttachmentDeletionClient} from '../../../lib/device/xctest-attachment-deletion-client';
import type {RemoteXPCFacade, RemoteXPCTestAttachment} from '../../../lib/device/remote-xpc';
import {isTunnelAvailabilityError} from '../../../lib/device/remote-xpc';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

chai.use(chaiAsPromised);

function mockFacade(
  overrides: {
    udid?: string;
    eligible?: boolean;
    XCTestAttachment?: RemoteXPCTestAttachment;
    shouldUseRemoteXPC?: RemoteXPCFacade['shouldUseRemoteXPC'];
    getXCTestAttachment?: RemoteXPCFacade['getXCTestAttachment'];
  } = {},
): RemoteXPCFacade {
  const {
    udid = 'udid',
    eligible = true,
    XCTestAttachment = class {} as unknown as RemoteXPCTestAttachment,
    shouldUseRemoteXPC = sinon.stub().resolves(true),
    getXCTestAttachment = sinon.stub().resolves(XCTestAttachment),
  } = overrides;

  return {
    udid,
    get eligible() {
      return eligible;
    },
    shouldUseRemoteXPC,
    getXCTestAttachment,
  } as RemoteXPCFacade;
}

describe('XctestAttachmentDeletionClient', function () {
  it('rejects create when session is not eligible', async function () {
    await expect(
      XctestAttachmentDeletionClient.create(mockFacade({eligible: false})),
    ).to.be.rejectedWith(/iOS 18/);
  });

  it('rejects create when remotexpc is unavailable', async function () {
    const facade = mockFacade({
      shouldUseRemoteXPC: sinon.stub().resolves(false),
    });
    await expect(XctestAttachmentDeletionClient.create(facade)).to.be.rejectedWith(
      /appium-ios-remotexpc must be installed/,
    );
  });

  it('invokes XCTestAttachment.delete when the facade provides the class', async function () {
    const deleteStub = sinon.stub().resolves();
    const MockAtt = class {
      delete = deleteStub;
      constructor(public udid: string) {}
    } as unknown as RemoteXPCTestAttachment;
    const facade = mockFacade({
      udid: 'my-udid',
      XCTestAttachment: MockAtt,
    });
    const client = await XctestAttachmentDeletionClient.create(facade);
    await client.deleteAttachmentsByUuid(['uuid-1']);
    expect(deleteStub.calledOnce).to.equal(true);
    expect(deleteStub.firstCall.args[0]).to.eql(['uuid-1']);
  });

  it('rejects when delete fails', async function () {
    const deleteStub = sinon.stub().rejects(new Error('delete err'));
    const MockAtt = class {
      delete = deleteStub;
    } as unknown as RemoteXPCTestAttachment;
    const facade = mockFacade({XCTestAttachment: MockAtt});
    const client = await XctestAttachmentDeletionClient.create(facade);
    await expect(client.deleteAttachmentsByUuid(['u'])).to.be.rejectedWith('delete err');
  });

  it('detects TunnelAvailabilityError by name', function () {
    const err = new Error('tunnel down');
    err.name = 'TunnelAvailabilityError';
    expect(isTunnelAvailabilityError(err)).to.equal(true);
  });

  it('detects TunnelAvailabilityError by constructor name fallback', function () {
    const err = {constructor: {name: 'TunnelAvailabilityError'}};
    expect(isTunnelAvailabilityError(err)).to.equal(true);
  });

  it('does not misclassify unrelated errors as tunnel availability', function () {
    expect(isTunnelAvailabilityError(new Error('other'))).to.equal(false);
  });
});
