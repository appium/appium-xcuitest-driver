import { setPasteboard, getPasteboard } from 'node-simctl';

let commands = {};

commands.mobileSetPasteboard = async function (opts = {}) {
  if (!this.isSimulator()) {
    throw new Error('Setting pasteboard content is not supported on real devices');
  }
  const {content, encoding} = opts;
  if (!content) {
    throw new Error('Pasteboard content is mandatory to set');
  }
  if (encoding) {
    return await setPasteboard(content, encoding);
  }
  return await setPasteboard(content);
};

commands.mobileGetPasteboard = async function (opts = {}) {
  if (!this.isSimulator()) {
    throw new Error('Getting pasteboard content is not supported on real devices');
  }
  const {encoding} = opts;
  if (encoding) {
    return await getPasteboard(encoding);
  }
  return await getPasteboard();
};

export { commands };
export default commands;
