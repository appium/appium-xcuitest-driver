import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import sinon from 'sinon';
import * as Logs from '../../lib/device-log/ios-log';
import * as CrashLogs from '../../lib/device-log/ios-crash-log';
import { startLogCapture } from '../../lib/commands/log';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - startLogCapture', function () {

  let startCaptureSpy, crashLogStub, iosLogStub;

  before(function () {
    let spy = {
      startCapture: _.noop,
    };
    startCaptureSpy = sinon.spy(spy, 'startCapture');
    crashLogStub = sinon.stub(CrashLogs, 'IOSCrashLog', function () {
      this.startCapture = _.noop;
    });
    iosLogStub = sinon.stub(Logs, 'IOSLog', function () {
      this.startCapture = spy.startCapture;
    });
  });

  after(function () {
    startCaptureSpy.restore();
    crashLogStub.restore();
    iosLogStub.restore();
  });

  // establish that the basic things work as we imagine
  it('should not spawn more than one instance of idevicesyslog', async function () {
    const fakeInstance = {
      logs: undefined,
      opts: {},
      isRealDevice: _.noop,
    };
    startCaptureSpy.callCount.should.equal(0);
    await startLogCapture.call(fakeInstance);
    startCaptureSpy.callCount.should.equal(1);
    fakeInstance.logs.syslog.isCapturing = true;
    await startLogCapture.call(fakeInstance);
    startCaptureSpy.callCount.should.equal(1);
  });
});
