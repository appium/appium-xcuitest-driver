import {XctestAttachmentDeletionClient} from '../../../lib/device/xctest-attachment-deletion-client';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

chai.use(chaiAsPromised);

function mockLog() {
  return {warn: sinon.stub(), debug: sinon.stub(), info: sinon.stub(), error: sinon.stub()} as any;
}

describe('XctestAttachmentDeletionClient', function () {
  it('isDeletionAvailable is false on iOS 17', async function () {
    expect(await XctestAttachmentDeletionClient.isDeletionAvailable('udid', '17.0')).to.equal(
      false,
    );
  });

  it('isDeletionAvailable is true when XCTestAttachment is injected', async function () {
    const MockAtt = class {};
    const mod = {XCTestAttachment: MockAtt} as any;
    expect(await XctestAttachmentDeletionClient.isDeletionAvailable('udid', '18.0', mod)).to.equal(
      true,
    );
  });

  it('isDeletionAvailable is false when module lacks XCTestAttachment', async function () {
    const log = mockLog();
    expect(
      await XctestAttachmentDeletionClient.isDeletionAvailable('udid', '18.0', {}, log),
    ).to.equal(false);
    expect(log.warn.callCount).to.equal(1);
    expect(String(log.warn.firstCall.args[0])).to.match(/appium-ios-remotexpc/i);
  });

  it('rejects create on iOS 17', async function () {
    await expect(XctestAttachmentDeletionClient.create('udid', '17.0')).to.be.rejectedWith(
      /iOS 18/,
    );
  });

  it('rejects create when XCTestAttachment is missing from injected module', async function () {
    await expect(XctestAttachmentDeletionClient.create('udid', '18.0', {})).to.be.rejectedWith(
      /XCTestAttachment/,
    );
  });

  it('invokes XCTestAttachment.delete when remotexpc module is injected', async function () {
    const deleteStub = sinon.stub().resolves();
    const MockAtt = class {
      constructor(public udid: string) {}
      delete = deleteStub;
    };
    const mod = {XCTestAttachment: MockAtt} as any;
    const client = await XctestAttachmentDeletionClient.create('my-udid', '18.0', mod);
    await client.deleteAttachmentsByUuid(['uuid-1']);
    expect(deleteStub.calledOnce).to.equal(true);
    expect(deleteStub.firstCall.args[0]).to.eql(['uuid-1']);
  });

  it('rejects when delete fails', async function () {
    const deleteStub = sinon.stub().rejects(new Error('delete err'));
    const MockAtt = class {
      delete = deleteStub;
    };
    const mod = {XCTestAttachment: MockAtt} as any;
    const client = await XctestAttachmentDeletionClient.create('udid', '18.0', mod);
    await expect(client.deleteAttachmentsByUuid(['u'])).to.be.rejectedWith('delete err');
  });
});
