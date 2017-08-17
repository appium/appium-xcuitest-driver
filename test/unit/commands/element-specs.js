import sinon from 'sinon';
import XCUITestDriver from '../../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { withMocks } from 'appium-test-support';


chai.should();
chai.use(chaiAsPromised);

describe('element commands', function () {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxySpy.reset();
  });

  describe('setValueImmediate', withMocks({driver}, (mocks) => {
    it('should call setValue', async function () {
      mocks.driver
        .expects('setValue')
        .once().withExactArgs('hello', 2).returns();
      await driver.setValueImmediate('hello', 2);
      mocks.driver.verify();
    });
  }));

  describe('setValue', function () {
    const elementId = 2;
    const expectedEndpoint = `/element/${elementId}/value`;
    const expectedMethod = 'POST';

    describe('success', function () {
      afterEach(function () {
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql(expectedEndpoint);
        proxySpy.firstCall.args[1].should.eql(expectedMethod);
      });

      it('should proxy string as array of characters', async function () {
        await driver.setValue('hello', elementId);
        proxySpy.firstCall.args[2].should.eql({value: ['h', 'e', 'l', 'l', 'o']});
      });
      it('should proxy integer as array of characters', async function () {
        await driver.setValue(1234, elementId);
        proxySpy.firstCall.args[2].should.eql({value: ['1', '2', '3', '4']});
      });
      it('should proxy string array as array of characters', async function () {
        await driver.setValue(['hel', 'lo'], elementId);
        proxySpy.firstCall.args[2].should.eql({value: ['h', 'e', 'l', 'l', 'o']});
      });
      it('should proxy integer array as array of characters', async function () {
        await driver.setValue([1234], elementId);
        proxySpy.firstCall.args[2].should.eql({value: ['1', '2', '3', '4']});
      });
    });

    describe('failure', function () {
      it('should throw invalid argument exception for null', async function () {
        await driver.setValue(null, elementId)
          .should.eventually.be.rejectedWith(/Invalid argument to setValue: 'null'/);
      });
      it('should throw invalid argument exception for object', async function () {
        await driver.setValue({hi: 'there'}, elementId)
          .should.eventually.be.rejectedWith(/Invalid argument to setValue: '{"hi":"there"}'/);
      });
    });
  });
});
