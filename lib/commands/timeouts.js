import log from '../logger';

const commands = {}, helpers = {}, extensions = {};

// pageLoad
commands.pageLoadTimeoutW3C = async function pageLoadTimeoutW3C (ms) {
  await this.setPageLoadTimeout(this.parseTimeoutArgument(ms));
};

commands.pageLoadTimeoutMJSONWP = async function pageLoadTimeoutMJSONWP (ms) {
  await this.setPageLoadTimeout(this.parseTimeoutArgument(ms));
};

// script
commands.scriptTimeoutW3C = async function scriptTimeoutW3C (ms) {
  await this.asyncScriptTimeout(ms);
};

commands.scriptTimeoutMJSONWP = async function scriptTimeoutMJSONWP (ms) {
  await this.asyncScriptTimeout(ms);
};

commands.asyncScriptTimeout = async function asyncScriptTimeout (ms) { // eslint-disable-line require-await
  this.setAsyncScriptTimeout(this.parseTimeoutArgument(ms));
};

helpers.setPageLoadTimeout = function setPageLoadTimeout (ms) {
  ms = parseInt(ms, 10);
  this.pageLoadMs = ms;
  if (this.remote) {
    this.remote.pageLoadMs = this.pageLoadMs;
  }
  log.debug(`Set page load timeout to ${ms}ms`);
};

helpers.setAsyncScriptTimeout = function setAsyncScriptTimeout (ms) {
  this.asyncWaitMs = ms;
  log.debug(`Set async script timeout to ${ms}ms`);
};

Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
