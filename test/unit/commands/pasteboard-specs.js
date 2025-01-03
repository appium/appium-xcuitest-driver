import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import {Simctl} from 'node-simctl';

describe('pasteboard commands', function () {
  const driver = new XCUITestDriver();
  let isSimulatorStub, setPasteboardStub, getPasteboardStub;

  let chai;

  before(async function () {
    chai = await import('chai');
    chai.should();
  });

  beforeEach(function () {
    const simctl = new Simctl();
    setPasteboardStub = sinon.stub(simctl, 'setPasteboard');
    getPasteboardStub = sinon.stub(simctl, 'getPasteboard');
    driver._device = { simctl };
    isSimulatorStub = sinon.stub(driver, 'isSimulator');
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
      // @ts-expect-error incorrect usage
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
      // @ts-expect-error incorrect usage
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
