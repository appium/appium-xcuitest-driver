import { parseContainerPath } from '../../../lib/commands/file-movement';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { tempDir } from 'appium/support';

const should = chai.should();
chai.use(chaiAsPromised);

describe('file-movement', function () {
  describe('parseContainerPath', function () {
    it('should parse with container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath('@io.appium.example:app/Documents/file.txt', mntRoot);

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(`${mntRoot}/Documents/file.txt`);
      containerType.should.eql('app');
    });
    it('should parse with container root', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath('@io.appium.example:documents/', mntRoot);

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(mntRoot);
      containerType.should.eql('documents');
    });
    it('should parse without container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath('@io.appium.example/Documents/file.txt', mntRoot);

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(`${mntRoot}/Documents/file.txt`);
      should.equal(containerType, null);
    });
    it('should raise an error if no container path', async function () {
      const mntRoot = await tempDir.openDir();
      await parseContainerPath('@io.appium.example:documents', mntRoot).should.be.rejected;
    });
  });

});
