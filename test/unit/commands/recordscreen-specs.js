import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import XCUITestDriver from '../../..';
import { withMocks } from 'appium-test-support';
import { fs, tempDir } from 'appium-support';
import * as utils from '../../../lib/utils';
import * as teen_process from 'teen_process';
import sinon from 'sinon';
import B from 'bluebird';


chai.should();
chai.use(chaiAsPromised);

const driver = new XCUITestDriver();
describe('basic', withMocks({driver, fs, tempDir, utils, teen_process}, function (mocks) {
  const localFile = '/path/to/local.mp4';
  const mediaContent = new Buffer('appium');
  const udid = '1234';
  driver.opts = {
    device: {
      udid
    }
  };

  describe('startRecordingScreen', function () {
    beforeEach(function () {
      driver._recentScreenRecordingPath = null;
    });
    afterEach(function () {
      mocks.driver.verify();
      mocks.utils.verify();
      mocks.teen_process.verify();
      mocks.tempDir.verify();
      mocks.fs.verify();
    });

    it('should call simctl to start screen recording on Simulator', async function () {
      mocks.driver.expects('isRealDevice').atLeast(1).returns(false);
      mocks.utils.expects('getPidUsingPattern')
        .atLeast(1).withExactArgs(`simctl io ${udid} recordVideo`).returns(null);
      mocks.teen_process.expects('exec').once().returns(new B(() => {}));

      await driver.startRecordingScreen();
      driver._recentScreenRecordingPath.should.not.be.empty;
    });

    it('should return previous capture before starting a new recording on Simulator', async function () {
      const previousPath = '/some/video.mp4';

      mocks.driver.expects('isRealDevice').atLeast(1).returns(false);
      mocks.utils.expects('getPidUsingPattern')
        .atLeast(1).withExactArgs(`simctl io ${udid} recordVideo`).returns(null);
      mocks.teen_process.expects('exec').returns(new B(() => {}));
      mocks.fs.expects('exists').once().withExactArgs(previousPath).returns(true);
      mocks.fs.expects('stat').once().returns({size: 39571});
      mocks.fs.expects('readFile').once().withExactArgs(previousPath).returns(mediaContent);
      mocks.fs.expects('rimraf').once().withExactArgs(previousPath);
      mocks.tempDir.expects('path').once().returns(localFile);

      driver._recentScreenRecordingPath = previousPath;
      (await driver.startRecordingScreen())
        .should.be.eql(mediaContent.toString('base64'));
      driver._recentScreenRecordingPath.should.be.eql(localFile);
    });

    it('should call stat multiple times until size is big enough on a real device', async function () {
      mocks.driver.expects('isRealDevice').atLeast(1).returns(true);
      mocks.utils.expects('getPidUsingPattern')
        .atLeast(1).withExactArgs(`xrecord.*${udid}`).returns(null);
      mocks.fs.expects('which').once().withExactArgs('xrecord').returns('xrecord');
      mocks.teen_process.expects('exec').returns(new B(() => {}));
      let fileSizeStub = sinon.stub(fs, 'stat');
      try {
        fileSizeStub
            .onCall(0)
              .returns({size: 31})
            .onCall(1)
              .returns({size: 42});

        await driver.startRecordingScreen();
      } finally {
        fileSizeStub.restore();
      }
    });
  });

  describe('stopRecordingScreen', function () {
    beforeEach(function () {
      mocks.driver.expects('isRealDevice').returns(false);
    });
    afterEach(function () {
      mocks.driver.verify();
      mocks.utils.verify();
      mocks.teen_process.verify();
      mocks.tempDir.verify();
      mocks.fs.verify();
    });

    it('should kill the process and get the content of the created mp4 file using ps', async function () {
      const pid = '1';
      driver._recentScreenRecordingPath = null;
      mocks.utils.expects('getPidUsingPattern').atLeast(1).returns(pid);
      mocks.teen_process.expects('exec').withExactArgs('ps', ['o', 'command', '-p', pid]).returns({output: `
      COMMAND
      xcrun simctl io ${udid} recordVideo ${localFile}
      `});
      mocks.teen_process.expects('exec').withExactArgs('kill', ['-2', pid]);
      mocks.teen_process.expects('exec').withExactArgs('kill', ['-0', pid]).throws();
      mocks.fs.expects('exists').once().withExactArgs(localFile).returns(true);
      mocks.fs.expects('readFile').once().withExactArgs(localFile).returns(mediaContent);
      mocks.fs.expects('rimraf').once().withExactArgs(localFile);
      mocks.fs.expects('stat').once().withExactArgs(localFile).returns({size: 100});

      (await driver.stopRecordingScreen()).should.eql(mediaContent.toString('base64'));
    });

    it('should use the remembered file path if present', async function () {
      const pid = '1';
      driver._recentScreenRecordingPath = localFile;
      mocks.utils.expects('getPidUsingPattern').atLeast(1).returns(pid);
      mocks.teen_process.expects('exec').withExactArgs('kill', ['-2', pid]);
      mocks.teen_process.expects('exec').withExactArgs('kill', ['-0', pid]).throws();
      mocks.fs.expects('exists').once().withExactArgs(localFile).returns(true);
      mocks.fs.expects('readFile').once().withExactArgs(localFile).returns(mediaContent);
      mocks.fs.expects('rimraf').once().withExactArgs(localFile);
      mocks.fs.expects('stat').once().withExactArgs(localFile).returns({size: 100});

      (await driver.stopRecordingScreen()).should.eql(mediaContent.toString('base64'));
    });

    it('should fail if the recorded file is too large', async function () {
      driver._recentScreenRecordingPath = localFile;
      mocks.utils.expects('getPidUsingPattern').atLeast(1).returns(null);
      mocks.fs.expects('exists').once().withExactArgs(localFile).returns(true);
      mocks.fs.expects('rimraf').once().withExactArgs(localFile);
      mocks.fs.expects('stat').once().withExactArgs(localFile)
        .returns({size: process.memoryUsage().heapTotal});

      await driver.stopRecordingScreen().should.eventually.be.rejectedWith(/is too large/);
    });

    it('should return empty string if no recording processes are running', async function () {
      driver._recentScreenRecordingPath = null;
      mocks.utils.expects('getPidUsingPattern').atLeast(1).returns(null);

      (await driver.stopRecordingScreen()).should.eql('');
    });
  });
}));
