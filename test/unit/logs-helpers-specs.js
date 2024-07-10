import { grepFile } from '../../lib/device-log/helpers';
import {fs, tempDir} from 'appium/support';
import path from 'node:path';


describe('log-helpers', function () {
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

  describe('grepFile', function () {
    let tmpRoot;

    beforeEach(async function () {
      tmpRoot = await tempDir.openDir();
    });

    afterEach(async function () {
      await fs.rimraf(tmpRoot);
    });

    it('should grep file content case sensitive', async function () {
      const filePath = path.join(tmpRoot, 'grep.test');
      await fs.writeFile(filePath, `123\n45\nab`, 'utf8');
      await grepFile(filePath, 'ab').should.eventually.be.true;
    });

    it('should grep file content case insensitive', async function () {
      const filePath = path.join(tmpRoot, 'grep.test');
      await fs.writeFile(filePath, `123\n45\nAB\ncd`, 'utf8');
      await grepFile(filePath, 'ab', {caseInsensitive: true}).should.eventually.be.true;
    });

    it('should return false if no match', async function () {
      const filePath = path.join(tmpRoot, 'grep.test');
      await fs.writeFile(filePath, `123\n45\nAB`, 'utf8');
      await grepFile(filePath, 'cd', {caseInsensitive: true}).should.eventually.be.false;
    });
  });
});
