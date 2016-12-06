import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('gesture commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('tap', () => {
    it('should send POST request to /tap on WDA when no element is given', async () => {
      let actions = [
        {action: 'tap'}
      ];
      await driver.performTouch(actions);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/tap/0');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
    it('should send POST request to /tap/element on WDA', async () => {
      let actions = [
        {action: 'tap', options: {element: 42}}
      ];
      await driver.performTouch(actions);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/tap/42');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
    it('should send POST request to /tap/element with offset on WDA', async () => {
      let actions = [
        {action: 'tap', options: {element: 42, x: 1, y: 2}}
      ];
      await driver.performTouch(actions);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/tap/42');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
  });

  describe('mobile methods', () => {
    describe('anything other than scroll', () => {
      it('should throw an error', async () => {
        await driver.execute('mobile: somesuch').should.be.rejected;
      });
    });

    describe('scroll', () => {
      it('should throw an error if no scroll type is specified', async () => {
        await driver.execute('mobile: scroll', {element: 4})
          .should.eventually.be.rejectedWith(/Mobile scroll supports the following strategies/);
      });
      it('should pass through bare element', async () => {
        await driver.execute('mobile: scroll', {element: 4, direction: 'down'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/uiaElement/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
      });
      it('should unpack element object', async () => {
        await driver.execute('mobile: scroll', {element: {ELEMENT: 4}, direction: 'down'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/uiaElement/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
      });
      it('should pass name strategy exclusively', async () => {
        await driver.execute('mobile: scroll', {element: 4, direction: 'down', name: 'something'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/uiaElement/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.eql({name: 'something'});
      });
      it('should pass direction strategy exclusively', async () => {
        await driver.execute('mobile: scroll', {element: 4, direction: 'down', predicateString: 'something'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/uiaElement/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.eql({direction: 'down'});
      });
      it('should pass predicateString strategy exclusively', async () => {
        await driver.execute('mobile: scroll', {element: 4, toVisible: true, predicateString: 'something'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/uiaElement/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.eql({predicateString: 'something'});
      });
    });
  });
});
