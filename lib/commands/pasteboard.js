const commands = {};

commands.mobileSetPasteboard = async function mobileSetPasteboard (opts = {}) {
  if (!this.isSimulator()) {
    throw new Error('Setting pasteboard content is not supported on real devices');
  }
  const {content, encoding} = opts;
  if (!content) {
    throw new Error('Pasteboard content is mandatory to set');
  }
  return await this.opts.device.simctl.setPasteboard(content, encoding);
};

commands.mobileGetPasteboard = async function mobileGetPasteboard (opts = {}) {
  if (!this.isSimulator()) {
    throw new Error('Getting pasteboard content is not supported on real devices');
  }
  return await this.opts.device.simctl.getPasteboard(opts.encoding);
};

export { commands };
export default commands;
