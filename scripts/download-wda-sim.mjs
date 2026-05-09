import {getWDAPrebuiltPackage} from './download-wda.mjs';
import {Command} from 'commander';
import { deprecate } from 'node:util';

const DEPRECATION_MESSAGE =
  "[DEPRECATED] 'download-wda-sim' is deprecated. " +
  "Use 'appium driver run xcuitest download-wda -- --kind=sim --platform=<platform> --outdir=<outdir>' instead.";

async function main() {
  const program = new Command();

  const oldHandler = deprecate(
    async (options) => {
      await getWDAPrebuiltPackage({...options, kind: 'sim'});
    },
    DEPRECATION_MESSAGE
  );

  program
    .name('appium driver run xcuitest download-wda-sim')
    .description('Download a prebuilt WebDriverAgentRunner for iOS/tvOS simulator')
    .addHelpText('beforeAll', `${DEPRECATION_MESSAGE}\n\n`)
    .requiredOption('--outdir <path>', 'Destination directory to download and unpack into')
    .requiredOption(
      '--platform <platform>',
      'Target platform (e.g. iOS or tvOS)',
      (value) => value,
    )
    .addHelpText(
      'after',
      `
EXAMPLES:
  # Download WDA for iOS simulator
  appium driver run xcuitest download-wda-sim -- --outdir ./wda-sim --platform iOS

  # Download WDA for tvOS simulator
  appium driver run xcuitest download-wda-sim -- --outdir ./wda-sim-tvos --platform tvOS`,
    )
    .action(oldHandler);

  await program.parseAsync(process.argv);
}

await main();

/**
 * @typedef {Object} DownloadOptions
 * @property {string} outdir
 * @property {string} platform
 */
