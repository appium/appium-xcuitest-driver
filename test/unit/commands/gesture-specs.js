import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('gesture commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.spy(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('tap', () => {
    it('should send POST request to /tap/0 on WDA', () => {
      let actions = [
        {action: 'tap'}
      ];
      driver.performTouch(actions);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/tap/0');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
    it('should send POST request to /tap/element on WDA', () => {
      let actions = [
        {action: 'tap', options: {element: 42}}
      ];
      driver.performTouch(actions);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/tap/42');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
    it('should send POST request to /tap/element with offset on WDA', () => {
      let actions = [
        {action: 'tap', options: {element: 42, x: 1, y: 2}}
      ];
      driver.performTouch(actions);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/tap/42');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
  });
});
