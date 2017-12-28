import sinon from 'sinon';
import XCUITestDriver from '../../..';
import { fs } from 'appium-support';

const teenProcessModule = require('teen_process');

describe('location commands', function () {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxySpy.reset();
  });

  describe('setLocation', function () {
    const location = {latitude: '1', longitude: '2'};
    let execSpy;
    let fsWhichSpy;

    beforeEach(function () {
      execSpy = sinon.stub(teenProcessModule, 'exec');
      fsWhichSpy = sinon.stub(fs, 'which');
    });

    afterEach(function () {
      execSpy.restore();
      fsWhichSpy.restore();
    });

    it('fail when location object is wrong', async function () {
      await driver.setGeoLocation({}).should.be.rejectedWith('Both latitude and longitude should be set');
    });

    it('use idevicelocation to set the location on real devices', async function () {
      const udid = '1234';

      driver.opts.udid = udid;
      driver.opts.realDevice = true;

      const toolName = 'idevicelocation';

      fsWhichSpy.returns(toolName);
      await driver.setGeoLocation(location);

      execSpy.calledOnce.should.be.true;
      execSpy.firstCall.args[0].should.eql(toolName);
      execSpy.firstCall.args[1].should.eql(['-u', udid, location.latitude, location.longitude]);
    });

    it('fail when idevicelocation doesnt exist on the host for real devices', async function () {
      driver.opts.realDevice = true;
      await driver.setGeoLocation(location).should.be.rejectedWith(`idevicelocation doesn't exist on the host`);
    });

    it('set geo location on simulator', async function () {
      driver.opts.realDevice = false;
      let deviceStub = sinon.mock(driver.opts, 'device');
      deviceStub.object.device = {
        setGeolocation: () => {},
      };
      let setGeolocationSpy = sinon.spy(driver.opts.device, 'setGeolocation');

      await driver.setGeoLocation(location);
      setGeolocationSpy.firstCall.args[0].should.eql(location.latitude);
      setGeolocationSpy.firstCall.args[1].should.eql(location.longitude);
    });
  });
});
