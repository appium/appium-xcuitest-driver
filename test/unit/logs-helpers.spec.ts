import path from 'node:path';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {fs, tempDir} from 'appium/support';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {grepFile} from '../../lib/device/log/helpers';

chai.use(chaiAsPromised);

describe('log-helpers', function () {
  describe('grepFile', function () {
    let tmpRoot: string;

    beforeEach(async function () {
      tmpRoot = await tempDir.openDir();
    });

    afterEach(async function () {
      await fs.rimraf(tmpRoot);
    });

    it('should grep file content case sensitive', async function () {
      const filePath = path.join(tmpRoot, 'grep.test');
      await fs.writeFile(filePath, `123\n45\nab`, 'utf8');
      await expect(grepFile(filePath, 'ab')).to.eventually.be.true;
    });

    it('should grep file content case insensitive', async function () {
      const filePath = path.join(tmpRoot, 'grep.test');
      await fs.writeFile(filePath, `123\n45\nAB\ncd`, 'utf8');
      await expect(grepFile(filePath, 'ab', {caseInsensitive: true})).to.eventually.be.true;
    });

    it('should return false if no match', async function () {
      const filePath = path.join(tmpRoot, 'grep.test');
      await fs.writeFile(filePath, `123\n45\nAB`, 'utf8');
      await expect(grepFile(filePath, 'cd', {caseInsensitive: true})).to.eventually.be.false;
    });
  });
});
