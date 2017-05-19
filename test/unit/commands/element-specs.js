import sinon from 'sinon';
import chai from 'chai';
import XCUITestDriver from '../../..';


describe('element commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('getText', () => {
    it('should send translated POST request to WDA', async () => {
      await driver.getText(1);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql(`/element/1/text`);
      proxySpy.firstCall.args[1].should.eql('GET');
    });

    it('should transform boolean response to a string', async () => {
      proxySpy.returns(true);
      const result = await driver.getText(1);
      result.should.be.equal('true');
    });

    it('should not transform a valid string response', async () => {
      proxySpy.returns('bla');
      const result = await driver.getText(1);
      result.should.be.equal('bla');
    });

    it('should not transform null response', async () => {
      proxySpy.returns(null);
      const result = await driver.getText(1);
      chai.should().equal(result, null);
    });
  });
});
