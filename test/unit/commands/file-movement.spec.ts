import {describe, it, beforeEach, afterEach} from 'node:test';

import {tempDir} from 'appium/support';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {parseContainerPath} from '../../../lib/commands/file-movement';
import {XCUITestDriver} from '../../../lib/driver';

chai.use(chaiAsPromised);

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

      expect(bundleId).to.eql('io.appium.example');
      expect(pathInContainer).to.eql(`${mntRoot}/Documents/file.txt`);
      expect(containerType).to.eql('app');
    });
    it('should parse with container root', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath(
        driver,
        '@io.appium.example:documents/',
        mntRoot,
      );

      expect(bundleId).to.eql('io.appium.example');
      expect(pathInContainer).to.eql(mntRoot);
      expect(containerType).to.eql('documents');
    });
    it('should parse without container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath(
        driver,
        '@io.appium.example/Documents/file.txt',
        mntRoot,
      );

      expect(bundleId).to.eql('io.appium.example');
      expect(pathInContainer).to.eql(`${mntRoot}/Documents/file.txt`);
      expect(containerType).equal(null);
    });
    it('should raise an error if no container path', async function () {
      const mntRoot = await tempDir.openDir();
      await expect(parseContainerPath(driver, '@io.appium.example:documents', mntRoot)).to.be.rejected;
    });
  });
});
