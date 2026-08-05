import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {tempDir} from 'appium/support.js';

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
});
