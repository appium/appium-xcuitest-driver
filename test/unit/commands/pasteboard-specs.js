import sinon from 'sinon';
import XCUITestDriver from '../../..';

const simctlModule = require('node-simctl');


describe('pasteboard commands', function () {
  const driver = new XCUITestDriver();
  let optsStub, deviceStub, setPasteboardSpy, getPasteboardSpy;

  beforeEach(() => {
    optsStub = sinon.mock(driver.opts);
    deviceStub = sinon.mock(driver.opts, 'device');
    setPasteboardSpy = sinon.spy(simctlModule, 'setPasteboard');
    getPasteboardSpy = sinon.spy(simctlModule, 'getPasteboard');
  });

  afterEach(() => {
    deviceStub.restore();
    optsStub.restore();
    setPasteboardSpy.restore();
    getPasteboardSpy.restore();
  });

  it('setPasteboard should not be called on a real device', async function () {
    deviceStub.object.realDevice = true;
    await driver.mobileSetPasteboard({content: 'bla'}).should.eventually.be.rejectedWith(/not supported/);
    setPasteboardSpy.notCalled.should.be.true;
  });

  it('setPasteboard should fail if no content is provided', async function () {
    deviceStub.object.realDevice = false;
    await driver.mobileSetPasteboard().should.eventually.be.rejectedWith(/mandatory to set/);
    setPasteboardSpy.notCalled.should.be.true;
  });

  it('getPasteboard should not be called on a real device', async function () {
    deviceStub.object.realDevice = true;
    await driver.mobileGetPasteboard().should.eventually.be.rejectedWith(/not supported/);
    getPasteboardSpy.notCalled.should.be.true;
  });

  it('setPasteboard should invoke correct simctl method', async function () {
    deviceStub.object.realDevice = false;
    const opts = {
      content: 'bla',
      encoding: 'latin-1',
    };
    await driver.mobileSetPasteboard(opts);
    setPasteboardSpy.calledOnce.should.be.true;
    setPasteboardSpy.firstCall.args[0].should.eql(opts.content);
    setPasteboardSpy.firstCall.args[1].should.eql(opts.encoding);
  });

  it('getPasteboard should invoke correct simctl method', async function () {
    deviceStub.object.realDevice = false;
    const content = 'bla';
    getPasteboardSpy.returns(content);
    const result = await driver.mobileGetPasteboard();
    getPasteboardSpy.calledOnce.should.be.true;
    result.should.eql(content);
  });
});
