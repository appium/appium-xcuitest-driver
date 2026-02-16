import {clearSystemFiles, markSystemFilesForCleanup, isLocalHost} from '../../lib/utils';
import {createSandbox} from 'sinon';
import {fs} from 'appium/support';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

const DERIVED_DATA_ROOT = '/path/to/DerivedData/WebDriverAgent-eoyoecqmiqfeodgstkwbxkfyagll';

describe('utils', function () {
  describe('clearSystemFiles', function () {
    let sandbox: ReturnType<typeof createSandbox>;
    let mockFs: ReturnType<typeof createSandbox.mock>;

    beforeEach(function () {
      sandbox = createSandbox();
      mockFs = sandbox.mock(fs);
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should delete logs', async function () {
      const wda = {
        retrieveDerivedDataPath() {
          return DERIVED_DATA_ROOT;
        },
      };
      mockFs.expects('glob').once().returns([]);
      mockFs.expects('exists').atLeast(1).returns(true);
      mockFs.expects('rimraf').once().withExactArgs(`${DERIVED_DATA_ROOT}/Logs`).resolves();
      await clearSystemFiles(wda);
      mockFs.verify();
    });

    it('should only delete logs once if the same folder was marked twice for deletion', async function () {
      const wda = {
        retrieveDerivedDataPath() {
          return DERIVED_DATA_ROOT;
        },
      };
      mockFs.expects('glob').once().returns([]);
      mockFs.expects('exists').atLeast(1).returns(true);
      mockFs.expects('rimraf').once().withExactArgs(`${DERIVED_DATA_ROOT}/Logs`).resolves();
      await markSystemFilesForCleanup(wda);
      await markSystemFilesForCleanup(wda);
      await clearSystemFiles(wda);
      await clearSystemFiles(wda);
      mockFs.verify();
    });
    it('should do nothing if no derived data path is found', async function () {
      const wda = {
        retrieveDerivedDataPath() {
          return null;
        },
      };
      mockFs.expects('rimraf').never();
      await clearSystemFiles(wda);
      mockFs.verify();
    });
  });

  describe('isLocalHost', function () {
    it('should be false with invalid input, undefined', function () {
      expect(isLocalHost(undefined as any)).to.be.false;
    });
    it('should be false with invalid input, empty', function () {
      expect(isLocalHost('')).to.be.false;
    });
    it('should be true with ipv4 localhost', function () {
      expect(isLocalHost('http://localhost')).to.be.true;
    });
    it('should be true with ipv4 localhost with port', function () {
      expect(isLocalHost('http://localhost:8888')).to.be.true;
    });
    it('should be true with ipv4 127.0.0.1', function () {
      expect(isLocalHost('http://127.0.0.1')).to.be.true;
    });
    it('should be true with ipv6 ::1', function () {
      expect(isLocalHost('http://[::1]')).to.be.true;
    });
    it('should be true with ipv6 ::ffff:127.0.0.1', function () {
      expect(isLocalHost('http://[::ffff:127.0.0.1]')).to.be.true;
    });
    it('should be true with ipv6 ::ffff:127.0.0.1 with port', function () {
      expect(isLocalHost('http://[::ffff:127.0.0.1]:8888')).to.be.true;
    });
    it('should be false with ipv4 192.168.1.100', function () {
      expect(isLocalHost('http://192.168.1.100')).to.be.false;
    });
    it('should be false with ipv4 192.168.1.100 with port', function () {
      expect(isLocalHost('http://192.168.1.100:8888')).to.be.false;
    });
    it('should be false with ipv6 2001:db8:85a3:8d3:1319:8a2e:370:7348', function () {
      expect(isLocalHost('http://[2001:db8:85a3:8d3:1319:8a2e:370:7348]')).to.be.false;
    });
  });
});
