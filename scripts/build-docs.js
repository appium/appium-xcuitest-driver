// for simplicity this file is not transpiled and is run directly via an npm script
/* eslint-disable promise/prefer-await-to-callbacks */
/* eslint-disable promise/prefer-await-to-then */

const {Mike} = require('@appium/docutils');
const {logger} = require('@appium/support');
const path = require('path');
const semver = require('semver');
const {version} = require('../package.json');


const log = logger.getLogger('Docs');

const DOCS_REMOTE = 'origin';
const DOCS_BRANCH = 'docs-site';
const DOCS_PREFIX = '';
const REPO_DIR = path.resolve(__dirname, '..');
const LATEST_ALIAS = 'latest';

const branch = process.env.APPIUM_DOCS_BRANCH || DOCS_BRANCH;
const prefix = process.env.APPIUM_DOCS_PREFIX || DOCS_PREFIX;
const remote = process.env.APPIUM_DOCS_REMOTE || DOCS_REMOTE;

const shouldPush = !!process.env.APPIUM_DOCS_PUBLISH;

async function main() {
  log.info(`Building XCUI docs and committing to ${DOCS_BRANCH}`);

  const semVersion = semver.parse(version);
  const majMinVer = `${semVersion.major}.${semVersion.minor}`;

  log.info(`Building docs for version ${majMinVer}`);
  const configFile = path.join(REPO_DIR, `mkdocs.yml`);
  const m = new Mike({
    branch,
    prefix,
    remote,
    configFile,
  });

  const docsAlreadyExisted = (await m.list()).length >= 1;

  const deployOpts = {
    version: majMinVer,
    alias: LATEST_ALIAS,
    shouldRebase: shouldPush,
    shouldPush,
    commit: `docs: auto-build docs for appium-xcuitest-driver@${majMinVer}`,
  };
  await m.deploy(deployOpts);

  if (!docsAlreadyExisted && shouldPush) {
    log.info(`Docs did not already exist so setting the latest alias to default`);
    await m.setDefault(LATEST_ALIAS);
  }
  log.info(`Docs built`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err); // eslint-disable-line no-console
    process.exit(1);
  });
}

module.exports = main;
