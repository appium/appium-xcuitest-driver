// for simplicity this file is not transpiled and is run directly via an npm script
/* eslint-disable promise/prefer-await-to-callbacks */
/* eslint-disable promise/prefer-await-to-then */

const {deploy} = require('@appium/docutils');
const {logger} = require('@appium/support');
const path = require('path');
const semver = require('semver');
const {version} = require('../package.json');

const log = logger.getLogger('Docs');

const DOCS_REMOTE = 'origin';
const DOCS_BRANCH = 'docs-site';
const DOCS_PREFIX = false;
const REPO_DIR = path.resolve(__dirname, '..');
const LATEST_ALIAS = 'latest';

const packageJson = require.resolve('../package.json');

const branch = process.env.APPIUM_DOCS_BRANCH ?? DOCS_BRANCH;
const deployPrefix = process.env.APPIUM_DOCS_PREFIX ?? DOCS_PREFIX;
const remote = process.env.APPIUM_DOCS_REMOTE ?? DOCS_REMOTE;

const push = Boolean(process.env.APPIUM_DOCS_PUBLISH);

async function main() {
  log.info(`Building XCUI docs and committing to ${DOCS_BRANCH}`);
  const {major, minor} = semver.parse(version);
  const deployVersion = `${major}.${minor}`;

  const mkdocsYml = path.join(REPO_DIR, 'mkdocs.yml');

  log.info(`Building docs for version ${deployVersion}`);
  await deploy({
    mkDocsYml: mkdocsYml,
    push,
    branch,
    deployPrefix,
    remote,
    packageJson,
    deployVersion,
    message: `docs: auto-build docs for appium-xcuitest-driver@${deployVersion}`,
    alias: LATEST_ALIAS,
  });
  log.info(`Docs built`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err); // eslint-disable-line no-console
    process.exitCode = 1;
  });
}

module.exports = main;
