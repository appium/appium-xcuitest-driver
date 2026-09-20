import releaseConfig from '@appium/semantic-release-config';

// Set only when the pipeline explicitly opts into a beta run (BETA_BRANCH_NAME set by
// .github/workflows/publish.js.yml's dist_tag input). Left undefined otherwise, so releaseConfig
// leaves `branches` unset and semantic-release's own default branches list applies - which
// already treats a branch literally named `beta` as a prerelease channel.
const betaBranch = process.env.BETA_BRANCH_NAME || undefined;

// Publishing is handled by a separate CI step against a staged, bundled package (see
// appium/appium-workflows's publish-npm-bundle action), so the npm plugin only bumps
// package.json's version here and does not itself publish.
const config = releaseConfig({betaBranch});
config.plugins = config.plugins.map((plugin) =>
  plugin === '@semantic-release/npm' ? ['@semantic-release/npm', {npmPublish: false}] : plugin,
);

export default config;
