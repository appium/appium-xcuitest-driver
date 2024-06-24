import sinon from 'sinon';
import XCUITestDriver from '../../../lib/driver';
import {gesturesChainToString} from '../../../lib/commands/gesture';
import _ from 'lodash';


describe('gesture commands', function () {
  const driver = new XCUITestDriver();
  const proxySpy = sinon.stub(driver, 'proxyCommand');

  let chai;
  let expect;

  before(async function () {
    chai = await import('chai');
    expect = chai.expect;
  });

  afterEach(function () {
    proxySpy.reset();
  });

  describe('gesturesChainToString', function () {
    it('should properly transform simple chain', function () {
      expect(gesturesChainToString([{action: 'press'}, {action: 'release'}])).to.equal('press-release');
    });

    it('should properly transform complex chain with default keys', function () {
      expect(gesturesChainToString([
        {action: 'press', x: 1, options: {count: 1}},
        {action: 'release'},
      ])).to.equal('press(options={"count":1})-release');
    });

    it('should properly transform complex chain with custom keys', function () {
      expect(gesturesChainToString(
        [{action: 'press', x: 1, options: {count: 1}}, {action: 'release'}],
        ['x'],
      )).to.equal('press(x=1)-release');
    });

    it('should properly transform complex chain with all keys', function () {
      expect(gesturesChainToString([{action: 'press', x: 1}, {action: 'release'}], null)).to.equal(
        'press(x=1)-release',
      );
    });
  });

  describe('mobile methods', function () {
    describe('anything other than scroll', function () {
      it('should throw an error', function () {
        expect(driver.execute('mobile: somesuch')).to.eventually.be.rejected;
      });
    });

    describe('scroll', function () {
      it('should throw an error if no scroll type is specified', function () {
        expect(driver
          .execute('mobile: scroll', {element: 4}))
          .to.eventually.be.rejectedWith(/Mobile scroll supports the following strategies/);
      });
      it('should pass through bare element', async function () {
        await driver.execute('mobile: scroll', {element: 4, direction: 'down'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
      });
      it('should unpack element object', async function () {
        await driver.execute('mobile: scroll', {element: {ELEMENT: 4}, direction: 'down'});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/scroll');
        proxySpy.firstCall.args[1].should.eql('POST');
      });
      it('should pass name strategy exclusively', async function () {
        await driver.execute('mobile: scroll', {element: 4, direction: 'down', name: 'something'});
        proxySpy.should.have.been.calledOnceWith('/wda/element/4/scroll', 'POST', {
          name: 'something',
        });
      });
      it('should pass direction strategy exclusively', async function () {
        await driver.execute('mobile: scroll', {
          element: 4,
          direction: 'down',
          predicateString: 'something',
        });
        proxySpy.should.have.been.calledOnceWith('/wda/element/4/scroll', 'POST', {
          direction: 'down',
        });
      });
      it('should pass predicateString strategy exclusively', async function () {
        await driver.execute('mobile: scroll', {
          element: 4,
          toVisible: true,
          predicateString: 'something',
        });
        proxySpy.should.have.been.calledOnceWith('/wda/element/4/scroll', 'POST', {
          predicateString: 'something',
        });
      });
    });

    describe('swipe', function () {
      const commandName = 'swipe';

      it('should throw an error if no direction is specified', function () {
        expect(driver.execute(`mobile: ${commandName}`, {element: 4})).to.eventually.be.rejected;
      });

      it('should throw an error if invalid direction', function () {
        expect(driver.execute(`mobile: ${commandName}`, {element: 4, direction: 'foo'})).to.eventually.be
          .rejected;
      });

      it('should proxy a swipe up request through to WDA', async function () {
        await driver.execute(`mobile: ${commandName}`, {element: 4, direction: 'up'});
        proxySpy.should.have.been.calledOnceWith('/wda/element/4/swipe', 'POST', {direction: 'up'});
      });
    });

    describe('pinch', function () {
      const commandName = 'pinch';

      it('should throw an error if no mandatory parameter is specified', function () {
        expect(driver.execute(`mobile: ${commandName}`, {element: 4, scale: 4.1})).to.eventually.be.rejected;
        expect(driver.execute(`mobile: ${commandName}`, {element: 4, velocity: -0.5})).to.eventually.be.rejected;
      });

      it('should throw an error if param is invalid', function () {
        expect(driver
          .execute(`mobile: ${commandName}`, {element: 4, scale: '', velocity: 1}))
          .to.eventually.be.rejectedWith(/should be a valid number/);
        expect(driver
          .execute(`mobile: ${commandName}`, {element: 4, scale: 0, velocity: null}))
          .to.eventually.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a pinch request through to WDA', async function () {
        const opts = {element: 4, scale: 1, velocity: '1'};
        await driver.execute(`mobile: ${commandName}`, opts);
        proxySpy.should.have.been.calledOnceWith('/wda/element/4/pinch', 'POST', {
          scale: opts.scale,
          velocity: parseInt(opts.velocity, 10),
        });
      });
    });

    describe('doubleTap', function () {
      const commandName = 'doubleTap';

      it('should proxy a doubleTap request without element through to WDA', async function () {
        await driver.execute(`mobile: ${commandName}`);
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/doubleTap');
        proxySpy.firstCall.args[1].should.eql('POST');
      });

      it('should proxy a doubleTap request for an element through to WDA', async function () {
        await driver.execute(`mobile: ${commandName}`, {element: 4});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/doubleTap');
        proxySpy.firstCall.args[1].should.eql('POST');
      });

      it('should proxy a doubleTap request for a coordinate point through to WDA', async function () {
        const opts = {x: 100, y: 100};
        await driver.execute(`mobile: ${commandName}`, opts);
        proxySpy.should.have.been.calledOnceWith('/wda/doubleTap', 'POST', opts);
      });
    });

    describe('twoFingerTap', function () {
      const commandName = 'twoFingerTap';

      it('should proxy a twoFingerTap request for an element through to WDA', async function () {
        await driver.execute(`mobile: ${commandName}`, {element: 4});
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/wda/element/4/twoFingerTap');
        proxySpy.firstCall.args[1].should.eql('POST');
      });
    });

    describe('touchAndHold', function () {
      const commandName = 'touchAndHold';

      it('should throw an error if no mandatory parameter is specified', function () {
        expect(driver.execute(`mobile: ${commandName}`, {x: 100, y: 200})).to.eventually.be.rejected;
      });

      it('should throw an error if param is invalid', function () {
        expect(driver
          .execute(`mobile: ${commandName}`, {duration: '', x: 1, y: 1}))
          .to.eventually.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a touchAndHold request without element through to WDA', async function () {
        const opts = {duration: 100};
        await driver.execute(`mobile: ${commandName}`, opts);
        proxySpy.should.have.been.calledOnceWith(
          '/wda/touchAndHold',
          'POST',
          {
            ...opts,
            x: undefined,
            y: undefined,
          },
        );
      });

      it('should proxy a touchAndHold request for an element through to WDA', async function () {
        const opts = {elementId: 4, duration: 100};
        await driver.execute(`mobile: ${commandName}`, opts);
        proxySpy.should.have.been.calledOnceWith(
          '/wda/element/4/touchAndHold',
          'POST',
          {
            ..._.omit(opts, 'elementId'),
            x: undefined,
            y: undefined,
          }
        );
      });

      it('should proxy a touchAndHold request for a coordinate point through to WDA', async function () {
        const opts = {duration: 100, x: 100, y: 100};
        await driver.execute('mobile: touchAndHold', opts);
        proxySpy.should.have.been.calledOnceWith('/wda/touchAndHold', 'POST', opts);
      });
    });

    describe('tap', function () {
      const commandName = 'tap';

      it('should proxy a tap request for an element through to WDA', async function () {
        const opts = {elementId: 4, x: 100, y: 100};
        await driver.execute(`mobile: ${commandName}`, opts);
        proxySpy.should.have.been.calledOnceWith('/wda/element/4/tap', 'POST', _.omit(opts, 'elementId'));
      });

      it('should proxy a tap request for a coordinate point through to WDA', async function () {
        const opts = {x: 100, y: 100};
        await driver.execute(`mobile: ${commandName}`, opts);
        proxySpy.should.have.been.calledOnceWith('/wda/tap', 'POST', opts);
      });
    });

    describe('selectPickerWheelValue', function () {
      const commandName = 'selectPickerWheelValue';

      it('should throw an error if no mandatory parameter is specified', function () {
        expect(driver.execute(`mobile: ${commandName}`, {})).to.eventually.be.rejected;
        expect(driver.execute(`mobile: ${commandName}`, {element: 4})).to.eventually.be.rejected;
        expect(driver.execute(`mobile: ${commandName}`, {order: 'next'})).to.eventually.be.rejected;
      });

      it('should throw an error if offset value cannot be parsed', function () {
        expect(driver
          .execute(`mobile: ${commandName}`, {element: 4, order: 'next', offset: 'bla'}))
          .to.eventually.be.rejectedWith(/should be a valid number/);
      });

      it('should throw an error if param is invalid', function () {
        expect(driver
          .execute(`mobile: ${commandName}`, {element: 4, order: 'bla'}))
          .to.eventually.be.rejectedWith(/is expected to be equal/);
      });

      it('should proxy a selectPickerWheel request for an element through to WDA', async function () {
        const opts = {elementId: 4, order: 'next', offset: 0.3};
        await driver.execute(`mobile: ${commandName}`, opts);
        proxySpy.should.have.been.calledOnceWith(
          '/wda/pickerwheel/4/select',
          'POST',
          _.omit(opts, 'elementId'),
        );
      });
    });

    describe('dragFromToForDuration', function () {
      const commandName = 'dragFromToForDuration';

      it('should throw an error if no mandatory parameter is specified', function () {
        expect(driver.execute(`mobile: ${commandName}`, {fromX: 1, fromY: 1, toX: 100, toY: 100}))
          .to.eventually.be.rejected;
        expect(driver.execute(`mobile: ${commandName}`, {
          duration: 100,
          fromY: 1,
          toX: 100,
          toY: 100,
        })).to.eventually.be.rejected;
        expect(driver.execute(`mobile: ${commandName}`, {
          duration: 100,
          fromX: 1,
          toX: 100,
          toY: 100,
        })).to.eventually.be.rejected;
        expect(driver.execute(`mobile: ${commandName}`, {
          duration: 100,
          fromX: 1,
          fromY: 1,
          toY: 100,
        })).to.eventually.be.rejected;
        expect(driver.execute(`mobile: ${commandName}`, {
          duration: 100,
          fromX: 1,
          fromY: 1,
          toX: 100,
        })).to.eventually.be.rejected;
      });

      it('should throw an error if param is invalid', function () {
        expect(driver
          .execute(`mobile: ${commandName}`, {duration: '', fromX: 1, fromY: 1, toX: 100, toY: 100}))
          .to.eventually.be.rejectedWith(/should be a valid number/);
        expect(driver
          .execute(`mobile: ${commandName}`, {
            duration: 100,
            fromX: '',
            fromY: 1,
            toX: 100,
            toY: 100,
          }))
          .to.eventually.be.rejectedWith(/should be a valid number/);
       expect(driver
        .execute(`mobile: ${commandName}`, {
          duration: 100,
          fromX: 1,
          fromY: null,
          toX: 100,
          toY: 100,
        }))
          .to.eventually.be.rejectedWith(/should be a valid number/);
        expect(driver
          .execute(`mobile: ${commandName}`, {
            duration: 100,
            fromX: 1,
            fromY: 1,
            toX: 'blabla',
            toY: 100,
          }))
          .to.eventually.be.rejectedWith(/should be a valid number/);
        expect(driver
          .execute(`mobile: ${commandName}`, {
            duration: 100,
            fromX: 1,
            fromY: 1,
            toX: 100,
            toY: NaN,
          }))
          .to.eventually.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a dragFromToForDuration request for an element through to WDA', async function () {
        const opts = {element: 4, duration: 100, fromX: 1, fromY: 1, toX: 100, toY: 100};
        await driver.execute(`mobile: ${commandName}`, {
          element: 4,
          duration: 100,
          fromX: 1,
          fromY: 1,
          toX: 100,
          toY: 100,
        });
        proxySpy.should.have.been.calledOnceWith(
          '/wda/element/4/dragfromtoforduration',
          'POST',
          _.omit(opts, 'element'),
        );
      });

      it('should proxy a dragFromToForDuration request for a coordinate point through to WDA', async function () {
        const opts = {duration: 100, fromX: 1, fromY: 1, toX: 100, toY: 100};
        await driver.execute(`mobile: ${commandName}`, opts);
        proxySpy.should.have.been.calledOnceWith('/wda/dragfromtoforduration', 'POST', opts);
      });
    });

  });
});

describe('W3C actions', function () {
  const driver = new XCUITestDriver();
  it('releaseActions should exist and do nothing', async function () {
    await driver.releaseActions();
  });
});
