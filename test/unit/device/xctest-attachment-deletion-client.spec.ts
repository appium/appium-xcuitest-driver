import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {RemoteXPCFacade} from '../../../lib/device/remote-xpc/index.js';
import {isTunnelAvailabilityError} from '../../../lib/device/remote-xpc/index.js';
import type {RemoteXPCTestAttachment} from '../../../lib/device/remote-xpc/utils.js';
import {XctestAttachmentDeletionClient} from '../../../lib/device/xctest-attachment-deletion-client.js';

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
    assert.strictEqual(deleteStub.calledOnce, true);
    assert.deepStrictEqual(deleteStub.firstCall.args[0], ['uuid-1']);
  });

  it('rejects when delete fails', async function () {
    const deleteStub = sinon.stub().rejects(new Error('delete err'));
    const MockAtt = class {
      delete = deleteStub;
    } as unknown as RemoteXPCTestAttachment;
    const facade = mockFacade({XCTestAttachment: MockAtt});
    const client = new XctestAttachmentDeletionClient(facade);
    await assert.rejects(client.deleteAttachmentsByUuid(['u']), (err: Error) => err.message.includes('delete err'));
  });

  it('detects TunnelAvailabilityError by name', function () {
    const err = new Error('tunnel down');
    err.name = 'TunnelAvailabilityError';
    assert.strictEqual(isTunnelAvailabilityError(err), true);
  });

  it('detects TunnelAvailabilityError by constructor name fallback', function () {
    const err = {constructor: {name: 'TunnelAvailabilityError'}};
    assert.strictEqual(isTunnelAvailabilityError(err), true);
  });

  it('does not misclassify unrelated errors as tunnel availability', function () {
    assert.strictEqual(isTunnelAvailabilityError(new Error('other')), false);
  });
});
