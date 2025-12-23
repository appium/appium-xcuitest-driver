import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import {expect} from 'chai';


describe('gesture commands', function () {
  const driver = new XCUITestDriver({} as any);

  let mockDriver;

  beforeEach(function () {
    mockDriver = sinon.mock(driver);
  });

  afterEach(function () {
    mockDriver.verify();
  });

  describe('mobile methods', function () {
    describe('anything other than scroll', function () {
      it('should throw an error', async function () {
        await expect(driver.execute('mobile: somesuch')).to.be.rejected;
      });
    });

    describe('scroll', function () {
      it('should throw an error if no scroll type is specified', async function () {
        await expect(
          driver.execute('mobile: scroll', {element: 4})
        ).to.be.rejectedWith(/Mobile scroll supports the following strategies/);
      });
      it('should pass through bare element', async function () {
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/scroll', 'POST', { direction: 'down' });
        await driver.execute('mobile: scroll', {element: 4, direction: 'down'});
      });
      it('should unpack element object', async function () {
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/scroll', 'POST', { direction: 'down' });
        await driver.execute('mobile: scroll', {element: {ELEMENT: 4}, direction: 'down'});
      });
      it('should pass name strategy exclusively', async function () {
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/scroll', 'POST', { name: 'something' });
        await driver.execute('mobile: scroll', {element: 4, direction: 'down', name: 'something'});
      });
      it('should pass direction strategy exclusively', async function () {
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/scroll', 'POST', { direction: 'down' });
        await driver.execute('mobile: scroll', {
          element: 4,
          direction: 'down',
          predicateString: 'something',
        });
      });
      it('should pass predicateString strategy exclusively', async function () {
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/scroll', 'POST', { predicateString: 'something' });
        await driver.execute('mobile: scroll', {
          element: 4,
          toVisible: true,
          predicateString: 'something',
        });
      });
    });

    describe('swipe', function () {
      const commandName = 'swipe';

      it('should throw an error if no direction is specified', async function () {
        await expect(driver.execute(`mobile: ${commandName}`, {element: 4})).to.be.rejected;
      });

      it('should throw an error if invalid direction', async function () {
        await expect(driver.execute(`mobile: ${commandName}`, {element: 4, direction: 'foo'})).to.be.rejected;
      });

      it('should proxy a swipe up request through to WDA', async function () {
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/swipe', 'POST', { direction: 'up' });
        await driver.execute(`mobile: ${commandName}`, {element: 4, direction: 'up'});
      });
    });

    describe('pinch', function () {
      const commandName = 'pinch';

      it('should throw an error if no mandatory parameter is specified', async function () {
        await expect(driver.execute(`mobile: ${commandName}`, {element: 4, scale: 4.1})).to.be.rejected;
        await expect(driver.execute(`mobile: ${commandName}`, {element: 4, velocity: -0.5})).to.be.rejected;
      });

      it('should throw an error if param is invalid', async function () {
        await expect(
          driver.execute(`mobile: ${commandName}`, {element: 4, scale: '', velocity: 1})
        ).to.be.rejectedWith(/should be a valid number/);
        await expect(
          driver.execute(`mobile: ${commandName}`, {element: 4, scale: 0, velocity: null})
        ).to.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a pinch request through to WDA', async function () {
        const opts = {element: 4, scale: 1, velocity: '1'};

        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/pinch', 'POST', {
          scale: opts.scale,
          velocity: parseInt(opts.velocity, 10),
        });
        await driver.execute(`mobile: ${commandName}`, opts);
      });
    });

    describe('doubleTap', function () {
      const commandName = 'doubleTap';

      it('should proxy a doubleTap request without element through to WDA', async function () {
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/doubleTap', 'POST', { x: undefined, y: undefined });
        await driver.execute(`mobile: ${commandName}`);
      });

      it('should proxy a doubleTap request for an element through to WDA', async function () {
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/doubleTap', 'POST', { x: undefined, y: undefined });
        await driver.execute(`mobile: ${commandName}`, {element: 4});
      });

      it('should proxy a doubleTap request for a coordinate point through to WDA', async function () {
        const opts = {x: 100, y: 100};
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/doubleTap', 'POST', opts);
        await driver.execute(`mobile: ${commandName}`, opts);
      });
    });

    describe('twoFingerTap', function () {
      const commandName = 'twoFingerTap';

      it('should proxy a twoFingerTap request for an element through to WDA', async function () {
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/twoFingerTap', 'POST');
        await driver.execute(`mobile: ${commandName}`, {element: 4});
      });
    });

    describe('touchAndHold', function () {
      const commandName = 'touchAndHold';

      it('should throw an error if no mandatory parameter is specified', async function () {
        await expect(driver.execute(`mobile: ${commandName}`, {x: 100, y: 200})).to.be.rejected;
      });

      it('should throw an error if param is invalid', async function () {
        await expect(
          driver.execute(`mobile: ${commandName}`, {duration: '', x: 1, y: 1})
        ).to.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a touchAndHold request without element through to WDA', async function () {
        const opts = {duration: 100};

        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/touchAndHold', 'POST', {
          ...opts,
          x: undefined,
          y: undefined,
        });

        await driver.execute(`mobile: ${commandName}`, opts);
      });

      it('should proxy a touchAndHold request for an element through to WDA', async function () {
        const opts = {elementId: 4, duration: 100};
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/touchAndHold', 'POST', { duration: 100, x: undefined, y: undefined });
        await driver.execute(`mobile: ${commandName}`, opts);
      });

      it('should proxy a touchAndHold request for a coordinate point through to WDA', async function () {
        const opts = {duration: 100, x: 100, y: 100};
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/touchAndHold', 'POST', opts);
        await driver.execute('mobile: touchAndHold', opts);
      });
    });

    describe('tap', function () {
      const commandName = 'tap';

      it('should proxy a tap request for an element through to WDA', async function () {
        const opts = {elementId: 4, x: 100, y: 100};
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/tap', 'POST', { x: 100, y: 100 });
        await driver.execute(`mobile: ${commandName}`, opts);
      });

      it('should proxy a tap request for a coordinate point through to WDA', async function () {
        const opts = {x: 100, y: 100};
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/tap', 'POST', { x: 100, y: 100 });
        await driver.execute(`mobile: ${commandName}`, opts);
      });
    });

    describe('selectPickerWheelValue', function () {
      const commandName = 'selectPickerWheelValue';

      it('should throw an error if no mandatory parameter is specified', async function () {
        await expect(driver.execute(`mobile: ${commandName}`, {})).to.be.rejected;
        await expect(driver.execute(`mobile: ${commandName}`, {element: 4})).to.be.rejected;
        await expect(driver.execute(`mobile: ${commandName}`, {order: 'next'})).to.be.rejected;
      });

      it('should throw an error if offset value cannot be parsed', async function () {
        await expect(
          driver.execute(`mobile: ${commandName}`, {element: 4, order: 'next', offset: 'bla'})
        ).to.be.rejectedWith(/should be a valid number/);
      });

      it('should throw an error if param is invalid', async function () {
        await expect(
          driver.execute(`mobile: ${commandName}`, {element: 4, order: 'bla'})
        ).to.be.rejectedWith(/is expected to be equal/);
      });

      it('should proxy a selectPickerWheel request for an element through to WDA', async function () {
        const opts = {elementId: 4, order: 'next', offset: 0.3};
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/pickerwheel/4/select', 'POST', { order: 'next', offset: 0.3 });
        await driver.execute(`mobile: ${commandName}`, opts);
      });
    });

    describe('dragFromToForDuration', function () {
      const commandName = 'dragFromToForDuration';

      it('should throw an error if no mandatory parameter is specified', async function () {
        await expect(
          driver.execute(`mobile: ${commandName}`, {fromX: 1, fromY: 1, toX: 100, toY: 100})
        ).to.be.rejected;
        await expect(driver.execute(`mobile: ${commandName}`, {
          duration: 100,
          fromY: 1,
          toX: 100,
          toY: 100,
        })).to.be.rejected;
        await expect(driver.execute(`mobile: ${commandName}`, {
          duration: 100,
          fromX: 1,
          toX: 100,
          toY: 100,
        })).to.be.rejected;
        await expect(driver.execute(`mobile: ${commandName}`, {
          duration: 100,
          fromX: 1,
          fromY: 1,
          toY: 100,
        })).to.be.rejected;
        await expect(driver.execute(`mobile: ${commandName}`, {
          duration: 100,
          fromX: 1,
          fromY: 1,
          toX: 100,
        })).to.be.rejected;
      });

      it('should throw an error if param is invalid', async function () {
        await expect(
          driver.execute(`mobile: ${commandName}`, {duration: '', fromX: 1, fromY: 1, toX: 100, toY: 100})
        ).to.be.rejectedWith(/should be a valid number/);
        await expect(
          driver.execute(`mobile: ${commandName}`, {
            duration: 100,
            fromX: '',
            fromY: 1,
            toX: 100,
            toY: 100,
          })
        ).to.be.rejectedWith(/should be a valid number/);
        await expect(
          driver.execute(`mobile: ${commandName}`, {
            duration: 100,
            fromX: 1,
            fromY: null,
            toX: 100,
            toY: 100,
          })
        ).to.be.rejectedWith(/should be a valid number/);
        await expect(
          driver.execute(`mobile: ${commandName}`, {
            duration: 100,
            fromX: 1,
            fromY: 1,
            toX: 'blabla',
            toY: 100,
          })
        ).to.be.rejectedWith(/should be a valid number/);
        await expect(
          driver.execute(`mobile: ${commandName}`, {
            duration: 100,
            fromX: 1,
            fromY: 1,
            toX: 100,
            toY: NaN,
          })
        ).to.be.rejectedWith(/should be a valid number/);
      });

      it('should proxy a dragFromToForDuration request for an element through to WDA', async function () {
        const opts = {element: 4, duration: 100, fromX: 1, fromY: 1, toX: 100, toY: 100};
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/element/4/dragfromtoforduration', 'POST', {
          duration: 100,
          fromX: 1,
          fromY: 1,
          toX: 100,
          toY: 100,
        });
        await driver.execute(`mobile: ${commandName}`, opts);
      });

      it('should proxy a dragFromToForDuration request for a coordinate point through to WDA', async function () {
        const opts = {duration: 100, fromX: 1, fromY: 1, toX: 100, toY: 100};
        mockDriver.expects('proxyCommand').once().withExactArgs('/wda/dragfromtoforduration', 'POST', {
          duration: 100,
          fromX: 1,
          fromY: 1,
          toX: 100,
          toY: 100,
        });
        await driver.execute(`mobile: ${commandName}`, opts);
      });
    });
  });
});

describe('W3C actions', function () {
  const driver = new XCUITestDriver({} as any);
  it('releaseActions should exist and do nothing', async function () {
    await driver.releaseActions();
  });
});
