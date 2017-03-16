import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('general commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('background', () => {
    it('should send translated POST request to WDA', async () => {
      await driver.background();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/deactivateApp');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
  });

  describe('touch id', () => {
    let deviceStub;

    beforeEach(async () => {
      deviceStub = sinon.mock(driver.opts, 'device');
    });

    afterEach(async () => {
      deviceStub.restore();
    });

    it('should send translated POST request to WDA', async () => {
      await driver.touchId();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/touch_id');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({match: true});
    });

    it('should send translated POST request to WDA with true', async () => {
      await driver.touchId(true);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/touch_id');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({match: true});
    });

    it('should send translated POST request to WDA with false', async () => {
      await driver.touchId(false);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/touch_id');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({match: false});
    });

    it('should not be called on a real device', async () => {
      deviceStub.object.realDevice = true;
      await driver.touchId().should.eventually.be.rejectedWith(/not supported/g);
      proxySpy.notCalled.should.be.true;
    });
  });

  describe('toggleEnrollTouchID', () => {
    let deviceStub, enrollTouchIDSpy, optsStub;

    beforeEach(() => {
      optsStub = sinon.mock(driver.opts);
      deviceStub = sinon.mock(driver.opts, 'device');
      deviceStub.object.device = {
        enrollTouchID: () => {},
      };
      enrollTouchIDSpy = sinon.spy(driver.opts.device, 'enrollTouchID');
    });

    afterEach(() => {
      deviceStub.restore();
      optsStub.restore();
      enrollTouchIDSpy.restore();
    });

    it('should throw exception if allowTouchIdEnroll is not set', async () => {
      optsStub.object.realDevice = false;
      await driver.toggleEnrollTouchId().should.be.rejectedWith(/enroll touchId/);
    });

    it('should be called on a Simulator', async () => {
      deviceStub.object.realDevice = false;
      deviceStub.object.allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId();
      enrollTouchIDSpy.calledOnce.should.be.true;
    });

    it('should not be called on a real device', async () => {
      deviceStub.object.realDevice = true;
      deviceStub.object.allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId().should.eventually.be.rejectedWith(/not supported/g);
      enrollTouchIDSpy.notCalled.should.be.true;
    });
  });
});
