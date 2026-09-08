import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import {fs, tempDir} from 'appium/support.js';
import {createSandbox, type SinonSandbox, type SinonStub} from 'sinon';

import {parseContainerPath} from '../../../lib/commands/file-movement.js';
import {XCUITestDriver} from '../../../lib/driver.js';

describe('file-movement', function () {
  describe('parseContainerPath', function () {
    let driver: XCUITestDriver;

    beforeEach(function () {
      driver = new XCUITestDriver({} as any);
    });

    afterEach(function () {
      driver = null as any;
    });

    it('should parse with container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath(
        driver,
        '@io.appium.example:app/Documents/file.txt',
        mntRoot,
      );

      assert.strictEqual(bundleId, 'io.appium.example');
      assert.strictEqual(pathInContainer, `${mntRoot}/Documents/file.txt`);
      assert.strictEqual(containerType, 'app');
    });
    it('should parse with container root', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath(
        driver,
        '@io.appium.example:documents/',
        mntRoot,
      );

      assert.strictEqual(bundleId, 'io.appium.example');
      assert.strictEqual(pathInContainer, mntRoot);
      assert.strictEqual(containerType, 'documents');
    });
    it('should parse without container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath(
        driver,
        '@io.appium.example/Documents/file.txt',
        mntRoot,
      );

      assert.strictEqual(bundleId, 'io.appium.example');
      assert.strictEqual(pathInContainer, `${mntRoot}/Documents/file.txt`);
      assert.strictEqual(containerType, null);
    });
    it('should raise an error if no container path', async function () {
      const mntRoot = await tempDir.openDir();
      await assert.rejects(parseContainerPath(driver, '@io.appium.example:documents', mntRoot));
    });
  });

  describe('mobileDeleteFile', function () {
    const simRoot = '/Users/me/Library/Developer/CoreSimulator/Devices/UDID/data';
    let driver: XCUITestDriver;
    let sandbox: SinonSandbox;
    let rimrafStub: SinonStub;

    beforeEach(function () {
      sandbox = createSandbox();
      driver = new XCUITestDriver({} as any);
      driver._device = {simctl: {}, getDir: () => simRoot} as any;
      sandbox.stub(fs, 'exists').resolves(true);
      rimrafStub = sandbox.stub(fs, 'rimraf').resolves();
    });

    afterEach(function () {
      sandbox.restore();
      driver = null as any;
    });

    it('should delete a file inside the simulator data directory', async function () {
      await driver.mobileDeleteFile('Library/foo.txt');

      assert.strictEqual(rimrafStub.calledOnceWithExactly(`${simRoot}/Library/foo.txt`), true);
    });

    for (const remotePath of ['', '.', 'x/..', '../data']) {
      it(`should refuse to delete the simulator data directory for '${remotePath}'`, async function () {
        await assert.rejects(driver.mobileDeleteFile(remotePath), errors.InvalidArgumentError);

        assert.strictEqual(rimrafStub.notCalled, true);
      });
    }
  });
});
