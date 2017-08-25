import { fs, tempDir } from 'appium-support';
import path from 'path';
import { addMedia } from 'node-simctl';

let commands = {};

commands.pushFile = async function (remotePath, base64Data) {
  if (!this.isSimulator()) {
    throw new Error('Media upload is only supported on Simulator');
  }
  const dstFolder = await tempDir.tempDir();
  // It is important to keep the original file name,
  // so simctl knows where to put the file
  const dstPath = path.resolve(dstFolder, path.basename(remotePath));
  try {
    await fs.writeFile(dstPath, new Buffer(base64Data, 'base64').toString('binary'), 'binary');
    await addMedia(this.opts.udid, dstPath);
  } finally {
    await fs.rimraf(dstFolder);
  }
};

export default commands;
