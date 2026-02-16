import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import {Simctl} from 'node-simctl';
import {expect} from 'chai';

describe('pasteboard commands', function () {
  const driver = new XCUITestDriver({} as any);
  let isSimulatorStub, setPasteboardStub, getPasteboardStub;

  beforeEach(function () {
    const simctl = new Simctl();
    setPasteboardStub = sinon.stub(simctl, 'setPasteboard');
    getPasteboardStub = sinon.stub(simctl, 'getPasteboard');
    driver._device = {simctl} as any;
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
      await expect(driver.mobileSetPasteboard({content: 'bla'} as any)).to.be.rejectedWith(
        /can only be performed on Simulator/,
      );
      expect(setPasteboardStub.notCalled).to.be.true;
    });

    it('getPasteboard should not be called', async function () {
      await expect(driver.mobileGetPasteboard()).to.be.rejectedWith(
        /can only be performed on Simulator/,
      );
      expect(getPasteboardStub.notCalled).to.be.true;
    });
  });

  describe('simulator', function () {
    beforeEach(function () {
      isSimulatorStub.returns(true);
    });

    it('setPasteboard should fail if no content is provided', async function () {
      await expect(driver.mobileSetPasteboard(undefined as any)).to.be.rejectedWith(
        /mandatory to set/,
      );
      expect(setPasteboardStub.notCalled).to.be.true;
    });

    it('setPasteboard should invoke correct simctl method', async function () {
      const content = 'bla';
      const encoding = 'latin1';
      await driver.mobileSetPasteboard(content, encoding);
      expect(setPasteboardStub.calledOnce).to.be.true;
      expect(setPasteboardStub.firstCall.args[0]).to.eql(content);
      expect(setPasteboardStub.firstCall.args[1]).to.eql(encoding);
    });

    it('getPasteboard should invoke correct simctl method', async function () {
      const content = 'bla';
      getPasteboardStub.returns(content);
      const result = await driver.mobileGetPasteboard();
      expect(getPasteboardStub.calledOnce).to.be.true;
      expect(result).to.eql(content);
    });
  });
});
