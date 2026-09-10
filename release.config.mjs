import releaseConfig from '@appium/semantic-release-config';

// Publishing is handled by a separate CI step against a staged, bundled package (see
// appium/appium-workflows's publish-npm-bundle action), so the npm plugin only bumps
// package.json's version here and does not itself publish.
const config = releaseConfig();
config.plugins = config.plugins.map((plugin) =>
  plugin === '@semantic-release/npm' ? ['@semantic-release/npm', {npmPublish: false}] : plugin,
);

export default config;
