import sinon from 'sinon';
import XCUITestDriver from '../../../lib/driver';
import Simctl from 'node-simctl';


describe('pasteboard commands', function () {
  const driver = new XCUITestDriver();
  driver.opts = {
    device: {
      simctl: new Simctl(),
    }
  };
  let isSimulatorStub, setPasteboardStub, getPasteboardStub;

  beforeEach(function () {
    isSimulatorStub = sinon.stub(driver, 'isSimulator');
    setPasteboardStub = sinon.stub(Simctl.prototype, 'setPasteboard');
    getPasteboardStub = sinon.stub(Simctl.prototype, 'getPasteboard');
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
      await driver.mobileSetPasteboard({content: 'bla'}).should.be.rejectedWith(/not supported/);
      setPasteboardStub.notCalled.should.be.true;
    });

    it('getPasteboard should not be called', async function () {
      await driver.mobileGetPasteboard().should.be.rejectedWith(/not supported/);
      getPasteboardStub.notCalled.should.be.true;
    });
  });

  describe('simulator', function () {
    beforeEach(function () {
      isSimulatorStub.returns(true);
    });

    it('setPasteboard should fail if no content is provided', async function () {
      await driver.mobileSetPasteboard().should.be.rejectedWith(/mandatory to set/);
      setPasteboardStub.notCalled.should.be.true;
    });

    it('setPasteboard should invoke correct simctl method', async function () {
      const content = 'bla';
      const encoding = 'latin1';
      await driver.mobileSetPasteboard(content, encoding);
      setPasteboardStub.calledOnce.should.be.true;
      setPasteboardStub.firstCall.args[0].should.eql(content);
      setPasteboardStub.firstCall.args[1].should.eql(encoding);
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
