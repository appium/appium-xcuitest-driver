module.exports = {
  require: ['ts-node/register'],
  forbidOnly: Boolean(process.env.CI),
  'node-option': ['no-experimental-strip-types'],
};
