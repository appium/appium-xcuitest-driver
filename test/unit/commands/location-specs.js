import sinon from 'sinon';
import XCUITestDriver from '../../..';
import { fs } from 'appium-support';
import * as teenProcess from 'teen_process';

describe('location commands', function () {
  const driver = new XCUITestDriver();
  const proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxySpy.reset();
  });

  describe('setLocation', function () {
    const location = {latitude: '1', longitude: '2'};
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

    it('fail when location object is wrong', async function () {
      await driver.setGeoLocation({}).should.be.rejectedWith('Both latitude and longitude should be set');
    });

    it('use idevicelocation to set the location on real devices', async function () {
      const udid = '1234';

      driver.opts.udid = udid;
      driver.opts.realDevice = true;

      const toolName = 'idevicelocation';

      fsWhichStub.returns(toolName);
      await driver.setGeoLocation(location);

      execStub.calledOnce.should.be.true;
      execStub.firstCall.args[0].should.eql(toolName);
      execStub.firstCall.args[1].should.eql(['-u', udid, location.latitude, location.longitude]);
    });

    it('fail when idevicelocation doesnt exist on the host for real devices', async function () {
      driver.opts.realDevice = true;
      fsWhichStub.throws();
      await driver.setGeoLocation(location).should.be.rejectedWith(`idevicelocation doesn't exist on the host`);
    });

    describe('simulator', function () {
      let deviceSetLocationSpy;
      const realDevice = driver.opts.realDevice;
      const device = driver.opts.device;
      beforeEach(function () {
        driver.opts.realDevice = false;

        deviceSetLocationSpy = sinon.spy();
        driver.opts.device = {
          setGeolocation: deviceSetLocationSpy,
        };
      });
      afterEach(function () {
        driver.opts.realDevice = realDevice;
        driver.opts.device = device;
        deviceSetLocationSpy.resetHistory();
      });
      it('should set on device', async function () {
        await driver.setGeoLocation(location);
        deviceSetLocationSpy.firstCall.args[0].should.eql(location.latitude);
        deviceSetLocationSpy.firstCall.args[1].should.eql(location.longitude);
      });
    });
  });
});
