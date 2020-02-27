import sinon from 'sinon';
import XCUITestDriver from '../../..';
import { services } from 'appium-ios-device';

describe('location commands', function () {
  const udid = '1234';

  const driver = new XCUITestDriver();
  const proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxySpy.reset();
  });

  describe('setLocation', function () {
    let startSimulateLocationServiceStub;
    let setLocationStub;

    beforeEach(function () {
      startSimulateLocationServiceStub = sinon.stub(services, 'startSimulateLocationService');
      let mockService = { setLocation () {}, close () {} };
      setLocationStub = sinon.stub(mockService, 'setLocation');
      startSimulateLocationServiceStub.returns(mockService);
    });

    afterEach(function () {
      startSimulateLocationServiceStub.restore();
      setLocationStub.restore();
    });

    it('should fail when location object is wrong', async function () {
      await driver.setGeoLocation({})
        .should.eventually.be.rejectedWith('Both latitude and longitude should be set');
    });

    describe('on real device', function () {
      beforeEach(function () {
        driver.opts.udid = udid;
        driver.opts.realDevice = true;
      });

      it('should use location service to set a location', async function () {
        await driver.setGeoLocation({latitude: 1.234, longitude: 2.789});

        startSimulateLocationServiceStub.calledOnce.should.be.true;
        startSimulateLocationServiceStub.firstCall.args[0].should.eql(udid);
        setLocationStub.args[0].should.eql([1.234, 2.789]);
      });

      it('should use location service to set a location with negative values', async function () {
        await driver.setGeoLocation({latitude: 1.234, longitude: -2});

        startSimulateLocationServiceStub.calledOnce.should.be.true;
        startSimulateLocationServiceStub.firstCall.args[0].should.eql(udid);
        setLocationStub.args[0].should.eql([1.234, -2]);
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
