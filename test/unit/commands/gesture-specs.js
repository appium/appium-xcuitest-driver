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
      proxySpy.firstCall.args[0].should.eql('/wda/tap/0');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
    it('should send POST request to /tap/element on WDA', async () => {
      let actions = [
        {action: 'tap', options: {element: 42}}
      ];
      await driver.performTouch(actions);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/tap/42');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
    it('should send POST request to /tap/element with offset on WDA', async () => {
      let actions = [
        {action: 'tap', options: {element: 42, x: 1, y: 2}}
      ];
      await driver.performTouch(actions);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/tap/42');
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
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
      });
      it('should unpack element object', async () => {
        await driver.execute('mobile: scroll', {element: {ELEMENT: 4}, direction: 'down'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
      });
      it('should pass name strategy exclusively', async () => {
        await driver.execute('mobile: scroll', {element: 4, direction: 'down', name: 'something'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.eql({name: 'something'});
      });
      it('should pass direction strategy exclusively', async () => {
        await driver.execute('mobile: scroll', {element: 4, direction: 'down', predicateString: 'something'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.eql({direction: 'down'});
      });
      it('should pass predicateString strategy exclusively', async () => {
        await driver.execute('mobile: scroll', {element: 4, toVisible: true, predicateString: 'something'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.eql({predicateString: 'something'});
      });
    });

    describe('swipe', () => {
      const commandName = 'swipe';

      it('should throw an error if no direction is specified', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4})
          .should.be.rejectedWith(/Error: Mobile swipe requires direction/);
      });

      it('should throw an error if invalid direction', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4, direction: 'foo'})
          .should.be.rejectedWith(/Error: Direction must be up, down, left or right/);
      });

      it('should proxy a swipe up request through to WDA', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4, direction: 'up'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/swipe');
        proxySpy.firstCall.args[1].should.eql('POST');
        return proxySpy.firstCall.args[2].should.eql({direction: 'up'});
      });
    });

    describe('pinch', () => {
      const commandName = 'pinch';

      it('should throw an error if no mandatory parameter is specified', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4, scale: 4.1})
          .should.be.rejectedWith(/parameter is mandatory/);
        await driver.execute(`mobile: ${commandName}`, {element: 4, velocity: -0.5})
          .should.be.rejectedWith(/parameter is mandatory/);
      });

      it('should throw an error if param is invalid', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4, scale: '', velocity: 1})
          .should.be.rejectedWith(/should be a valid number/);
        await driver.execute(`mobile: ${commandName}`, {element: 4, scale: 0, velocity: null})
          .should.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a pinch request through to WDA', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4, scale: 1, velocity: '1'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/pinch');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.have.keys(['scale', 'velocity']);
      });
    });

    describe('doubleTap', () => {
      const commandName = 'doubleTap';

      it('should throw an error if no mandatory parameter is specified', async () => {
        await driver.execute(`mobile: ${commandName}`, {x: 100}).should.be.rejectedWith(/parameter is mandatory/);
        await driver.execute(`mobile: ${commandName}`, {y: 200}).should.be.rejectedWith(/parameter is mandatory/);
      });

      it('should throw an error if param is invalid', async () => {
        await driver.execute(`mobile: ${commandName}`, {x: '', y: 1}).should.be.rejectedWith(/should be a valid number/);
        await driver.execute(`mobile: ${commandName}`, {x: 1, y: null}).should.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a doubleTap request for an element through to WDA', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/doubleTap');
        proxySpy.firstCall.args[1].should.eql('POST');
      });

      it('should proxy a doubleTap request for a coordinate point through to WDA', async () => {
        await driver.execute(`mobile: ${commandName}`, {x: 100, y: 100});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/doubleTap');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.have.keys(['x', 'y']);
      });
    });

    describe('twoFingerTap', () => {
      const commandName = 'twoFingerTap';

      it('should proxy a twoFingerTap request for an element through to WDA', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/twoFingerTap');
        proxySpy.firstCall.args[1].should.eql('POST');
      });
    });

    describe('touchAndHold', () => {
      const commandName = 'touchAndHold';

      it('should throw an error if no mandatory parameter is specified', async () => {
        await driver.execute(`mobile: ${commandName}`, {duration: 100, x: 1}).should.be.rejectedWith(/parameter is mandatory/);
        await driver.execute(`mobile: ${commandName}`, {duration: 100, y: 200}).should.be.rejectedWith(/parameter is mandatory/);
        await driver.execute(`mobile: ${commandName}`, {x: 100, y: 200}).should.be.rejectedWith(/parameter is mandatory/);
      });

      it('should throw an error if param is invalid', async () => {
        await driver.execute(`mobile: ${commandName}`, {duration: '', x: 1, y: 1}).should.be.rejectedWith(/should be a valid number/);
        await driver.execute(`mobile: ${commandName}`, {duration: 1, x: '', y: 1}).should.be.rejectedWith(/should be a valid number/);
        await driver.execute(`mobile: ${commandName}`, {duration: 1, x: 1, y: null}).should.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a touchAndHold request for an element through to WDA', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4, duration: 100});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/touchAndHold');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.have.keys(['duration']);
      });

      it('should proxy a touchAndHold request for a coordinate point through to WDA', async () => {
        await driver.execute('mobile: touchAndHold', {duration: 100, x: 100, y: 100});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/touchAndHold');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.have.keys(['duration', 'x', 'y']);
      });
    });

    describe('tap', () => {
      const commandName = 'tap';

      it('should throw an error if no mandatory parameter is specified', async () => {
        await driver.execute(`mobile: ${commandName}`, {}).should.be.rejectedWith(/parameter is mandatory/);
        await driver.execute(`mobile: ${commandName}`, {x: 100}).should.be.rejectedWith(/parameter is mandatory/);
        await driver.execute(`mobile: ${commandName}`, {y: 200}).should.be.rejectedWith(/parameter is mandatory/);
      });

      it('should throw an error if param is invalid', async () => {
        await driver.execute(`mobile: ${commandName}`, {x: '', y: 1}).should.be.rejectedWith(/should be a valid number/);
        await driver.execute(`mobile: ${commandName}`, {x: 1, y: null}).should.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a tap request for an element through to WDA', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4, x: 100, y: 100});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/tap/4');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.have.keys(['x', 'y']);
      });

      it('should proxy a tap request for a coordinate point through to WDA', async () => {
        await driver.execute(`mobile: ${commandName}`, {x: 100, y: 100});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/tap/0');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.have.keys(['x', 'y']);
      });
    });

    describe('dragFromToForDuration', () => {
      const commandName = 'dragFromToForDuration';

      it('should throw an error if no mandatory parameter is specified', async () => {
        await driver.execute(`mobile: ${commandName}`, {fromX: 1, fromY: 1, toX: 100, toY: 100})
          .should.be.rejectedWith(/parameter is mandatory/);
        await driver.execute(`mobile: ${commandName}`, {duration: 100, fromY: 1, toX: 100, toY: 100})
          .should.be.rejectedWith(/parameter is mandatory/);
        await driver.execute(`mobile: ${commandName}`, {duration: 100, fromX: 1, toX: 100, toY: 100})
          .should.be.rejectedWith(/parameter is mandatory/);
        await driver.execute(`mobile: ${commandName}`, {duration: 100, fromX: 1, fromY: 1, toY: 100})
          .should.be.rejectedWith(/parameter is mandatory/);
        await driver.execute(`mobile: ${commandName}`, {duration: 100, fromX: 1, fromY: 1, toX: 100})
          .should.be.rejectedWith(/parameter is mandatory/);
      });

      it('should throw an error if param is invalid', async () => {
        await driver.execute(`mobile: ${commandName}`, {duration: '', fromX: 1, fromY: 1, toX: 100, toY: 100})
          .should.be.rejectedWith(/should be a valid number/);
        await driver.execute(`mobile: ${commandName}`, {duration: 100, fromX: '', fromY: 1, toX: 100, toY: 100})
          .should.be.rejectedWith(/should be a valid number/);
        await driver.execute(`mobile: ${commandName}`, {duration: 100, fromX: 1, fromY: null, toX: 100, toY: 100})
          .should.be.rejectedWith(/should be a valid number/);
        await driver.execute(`mobile: ${commandName}`, {duration: 100, fromX: 1, fromY: 1, toX: 'blabla', toY: 100})
          .should.be.rejectedWith(/should be a valid number/);
        await driver.execute(`mobile: ${commandName}`, {duration: 100, fromX: 1, fromY: 1, toX: 100, toY: NaN})
          .should.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a dragFromToForDuration request for an element through to WDA', async () => {
        await driver.execute(`mobile: ${commandName}`, {element: 4, duration: 100, fromX: 1, fromY: 1, toX: 100, toY: 100});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/dragfromtoforduration');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.have.keys(['duration', 'fromX', 'fromY', 'toX', 'toY']);
      });

      it('should proxy a dragFromToForDuration request for a coordinate point through to WDA', async () => {
        await driver.execute(`mobile: ${commandName}`, {duration: 100, fromX: 1, fromY: 1, toX: 100, toY: 100});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/dragfromtoforduration');
        proxySpy.firstCall.args[1].should.eql('POST');
        proxySpy.firstCall.args[2].should.have.keys(['duration', 'fromX', 'fromY', 'toX', 'toY']);
      });
    });
  });
});
