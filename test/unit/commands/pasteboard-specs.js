import sinon from 'sinon';
import XCUITestDriver from '../../..';
import * as simctl from 'node-simctl';


describe('pasteboard commands', function () {
  const driver = new XCUITestDriver();
  let isSimulatorStub, setPasteboardStub, getPasteboardStub;

  beforeEach(function () {
    isSimulatorStub = sinon.stub(driver, 'isSimulator');
    setPasteboardStub = sinon.stub(simctl, 'setPasteboard');
    getPasteboardStub = sinon.stub(simctl, 'getPasteboard');
  });

  afterEach(function () {
    isSimulatorStub.restore();
    setPasteboardStub.restore();
    getPasteboardStub.restore();
  });

  describe('real device', function () {
    beforeEach(function () {
      isSimulatorStub.returns(false);
    });

    it('setPasteboard should not be called', async function () {
      await driver.mobileSetPasteboard({content: 'bla'}).should.eventually.be.rejectedWith(/not supported/);
      setPasteboardStub.notCalled.should.be.true;
    });

    it('getPasteboard should not be called', async function () {
      await driver.mobileGetPasteboard().should.eventually.be.rejectedWith(/not supported/);
      getPasteboardStub.notCalled.should.be.true;
    });
  });

  describe('simulator', function () {
    beforeEach(function () {
      isSimulatorStub.returns(true);
    });

    it('setPasteboard should fail if no content is provided', async function () {
      await driver.mobileSetPasteboard().should.eventually.be.rejectedWith(/mandatory to set/);
      setPasteboardStub.notCalled.should.be.true;
    });

    it('setPasteboard should invoke correct simctl method', async function () {
      const opts = {
        content: 'bla',
        encoding: 'latin1',
      };
      await driver.mobileSetPasteboard(opts);
      setPasteboardStub.calledOnce.should.be.true;
      setPasteboardStub.firstCall.args[1].should.eql(opts.content);
      setPasteboardStub.firstCall.args[2].should.eql(opts.encoding);
    });

    it('getPasteboard should invoke correct simctl method', async function () {
      const content = 'bla';
      getPasteboardStub.returns(content);
      const result = await driver.mobileGetPasteboard();
      getPasteboardStub.calledOnce.should.be.true;
      result.should.eql(content);
    });
  });
});
