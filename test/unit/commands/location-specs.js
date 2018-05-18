import sinon from 'sinon';
import XCUITestDriver from '../../..';
import { fs } from 'appium-support';
import * as teenProcess from 'teen_process';

describe('location commands', function () {
  const udid = '1234';
  const toolName = 'idevicelocation';

  const driver = new XCUITestDriver();
  const proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxySpy.reset();
  });

  describe('setLocation', function () {
    let execStub;
    let fsWhichStub;

    beforeEach(function () {
      execStub = sinon.stub(teenProcess, 'exec');
      fsWhichStub = sinon.stub(fs, 'which');
    });

    afterEach(function () {
      execStub.restore();
      fsWhichStub.restore();
    });

    it('should fail when location object is wrong', async function () {
      await driver.setGeoLocation({}).should.be.rejectedWith('Both latitude and longitude should be set');
    });

    describe('on real device', function () {
      beforeEach(function () {
        driver.opts.udid = udid;
        driver.opts.realDevice = true;
      });

      it('should use idevicelocation to set a location', async function () {
        fsWhichStub.returns(toolName);
        await driver.setGeoLocation({latitude: '1.234', longitude: '2.789'});

        execStub.calledOnce.should.be.true;
        execStub.firstCall.args[0].should.eql(toolName);
        execStub.firstCall.args[1].should.eql(['-u', udid, '1.234', '2.789']);
      });

      it('should use idevicelocation to set a location with negative values', async function () {
        fsWhichStub.returns(toolName);
        await driver.setGeoLocation({latitude: 1.234, longitude: -2});

        execStub.calledOnce.should.be.true;
        execStub.firstCall.args[0].should.eql(toolName);
        execStub.firstCall.args[1].should.eql(['-u', udid, '1.234', '--', '-2']);
      });

      it('should fail when idevicelocation doesnt exist on the host', async function () {
        fsWhichStub.throws();
        await driver.setGeoLocation({
          latitude: '1.234',
          longitude: '2.789'}
        ).should.be.rejectedWith(`idevicelocation doesn't exist on the host`);
      });
    });

    describe('on simulator', function () {
      let deviceSetLocationSpy;
      beforeEach(function () {
        driver.opts.realDevice = false;

        deviceSetLocationSpy = sinon.spy();
        driver.opts.device = {
          setGeolocation: deviceSetLocationSpy,
        };
      });
      afterEach(function () {
        deviceSetLocationSpy.resetHistory();
      });
      it('should set string coordinates', async function () {
        await driver.setGeoLocation({latitude: '1.234', longitude: '2.789'});
        deviceSetLocationSpy.firstCall.args[0].should.eql('1.234');
        deviceSetLocationSpy.firstCall.args[1].should.eql('2.789');
      });
      it('should set number coordinates', async function () {
        await driver.setGeoLocation({latitude: 1, longitude: -2});
        deviceSetLocationSpy.firstCall.args[0].should.eql('1');
        deviceSetLocationSpy.firstCall.args[1].should.eql('-2');
      });
    });
  });
});
