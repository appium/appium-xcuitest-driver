import {describe, it} from 'node:test';

import {use, expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

import type {RemoteXPCFacade} from '../../../lib/device/remote-xpc/index.js';
import {isTunnelAvailabilityError} from '../../../lib/device/remote-xpc/index.js';
import type {RemoteXPCTestAttachment} from '../../../lib/device/remote-xpc/utils.js';
import {XctestAttachmentDeletionClient} from '../../../lib/device/xctest-attachment-deletion-client.js';

use(chaiAsPromised);

function mockFacade(
  overrides: {
    udid?: string;
    XCTestAttachment?: RemoteXPCTestAttachment;
    getXCTestAttachment?: RemoteXPCFacade['getXCTestAttachment'];
  } = {},
): RemoteXPCFacade {
  const {
    udid = 'udid',
    XCTestAttachment = class {} as unknown as RemoteXPCTestAttachment,
    getXCTestAttachment = sinon.stub().resolves(XCTestAttachment),
  } = overrides;

  return {
    udid,
    getXCTestAttachment,
  } as RemoteXPCFacade;
}

describe('XctestAttachmentDeletionClient', function () {
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
    const client = new XctestAttachmentDeletionClient(facade);
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
    const client = new XctestAttachmentDeletionClient(facade);
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
