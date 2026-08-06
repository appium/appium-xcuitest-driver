import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {fs} from 'appium/support.js';
import {createSandbox} from 'sinon';

import {isLocalHost} from '../../lib/commands/helpers/index.js';
import {clearSystemFiles, markSystemFilesForCleanup} from '../../lib/commands/wda/cleanup.js';

const DERIVED_DATA_ROOT = '/path/to/DerivedData/WebDriverAgent-eoyoecqmiqfeodgstkwbxkfyagll';

describe('utils', function () {
  describe('clearSystemFiles', function () {
    let sandbox: ReturnType<typeof createSandbox>;
    let mockFs: sinon.SinonMock;

    beforeEach(function () {
      sandbox = createSandbox();
      mockFs = sandbox.mock(fs);
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should delete logs', async function () {
      const retrieveDerivedDataPath = async () => DERIVED_DATA_ROOT;
      mockFs.expects('glob').once().returns([]);
      mockFs.expects('exists').atLeast(1).returns(true);
      mockFs.expects('rimraf').once().withExactArgs(`${DERIVED_DATA_ROOT}/Logs`).resolves();
      await clearSystemFiles(retrieveDerivedDataPath);
      mockFs.verify();
    });

    it('should only delete logs once if the same folder was marked twice for deletion', async function () {
      const retrieveDerivedDataPath = async () => DERIVED_DATA_ROOT;
      mockFs.expects('glob').once().returns([]);
      mockFs.expects('exists').atLeast(1).returns(true);
      mockFs.expects('rimraf').once().withExactArgs(`${DERIVED_DATA_ROOT}/Logs`).resolves();
      await markSystemFilesForCleanup(retrieveDerivedDataPath);
      await markSystemFilesForCleanup(retrieveDerivedDataPath);
      await clearSystemFiles(retrieveDerivedDataPath);
      await clearSystemFiles(retrieveDerivedDataPath);
      mockFs.verify();
    });
    it('should do nothing if no derived data path is found', async function () {
      const retrieveDerivedDataPath = async () => undefined;
      mockFs.expects('rimraf').never();
      await clearSystemFiles(retrieveDerivedDataPath);
      mockFs.verify();
    });
  });

  describe('isLocalHost', function () {
    it('should be false with invalid input, undefined', function () {
      assert.strictEqual(isLocalHost(undefined as any), false);
    });
    it('should be false with invalid input, empty', function () {
      assert.strictEqual(isLocalHost(''), false);
    });
    it('should be true with ipv4 localhost', function () {
      assert.strictEqual(isLocalHost('http://localhost'), true);
    });
    it('should be true with ipv4 localhost with port', function () {
      assert.strictEqual(isLocalHost('http://localhost:8888'), true);
    });
    it('should be true with ipv4 127.0.0.1', function () {
      assert.strictEqual(isLocalHost('http://127.0.0.1'), true);
    });
    it('should be true with ipv6 ::1', function () {
      assert.strictEqual(isLocalHost('http://[::1]'), true);
    });
    it('should be true with ipv6 ::ffff:127.0.0.1', function () {
      assert.strictEqual(isLocalHost('http://[::ffff:127.0.0.1]'), true);
    });
    it('should be true with ipv6 ::ffff:127.0.0.1 with port', function () {
      assert.strictEqual(isLocalHost('http://[::ffff:127.0.0.1]:8888'), true);
    });
    it('should be false with ipv4 192.168.1.100', function () {
      assert.strictEqual(isLocalHost('http://192.168.1.100'), false);
    });
    it('should be false with ipv4 192.168.1.100 with port', function () {
      assert.strictEqual(isLocalHost('http://192.168.1.100:8888'), false);
    });
    it('should be false with ipv6 2001:db8:85a3:8d3:1319:8a2e:370:7348', function () {
      assert.strictEqual(isLocalHost('http://[2001:db8:85a3:8d3:1319:8a2e:370:7348]'), false);
    });
  });
});
