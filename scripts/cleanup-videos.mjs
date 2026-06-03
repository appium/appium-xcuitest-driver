#!/usr/bin/env node
/**
 * Lists XCTest attachment file names (UUIDs) under **testmanagerd**'s app-data `Attachments` and
 * `tmp/Attachments` folders
 * and deletes them via **appium-ios-remotexpc** (`XCTestAttachment.delete`), the same mechanism the
 * driver uses for real-device XCTest screen recording cleanup.
 *
 * **Prerequisites**
 *
 * - A Core Device tunnel (or equivalent) is already running.
 * - **appium-ios-remotexpc** is installed and exports **XCTestAttachment**.
 * - The device runs **iOS 18+** (attachment deletion is only supported there; OS version is read via **devicectl**).
 *
 * **Run** (from the driver package root)
 *
 *   appium driver run xcuitest cleanup-videos -- --udid <UDID>
 *   node ./scripts/cleanup-videos.mjs --udid <UDID> [--dry-run]
 *
 * Use `--dry-run` to print UUIDs without deleting.
 */

import {Devicectl} from 'node-devicectl';
import {logger, util} from 'appium/support.js';
import {Command} from 'commander';
import {XCTestAttachment} from 'appium-ios-remotexpc';

const log = logger.getLogger('cleanup-videos');

/** Same domain as `lib/commands/xctest-record-screen.ts` (real device). */
const DOMAIN_IDENTIFIER = 'com.apple.testmanagerd';
const DOMAIN_TYPE = 'appDataContainer';
const USERNAME = 'mobile';
/** Legacy layout and Xcode 26.5+ `tmp/Attachments` (same as xctest-record-screen.ts). */
const ATTACHMENT_SUBDIRECTORIES = ['Attachments', 'tmp/Attachments'];

/** Attachment entries are UUID-shaped file names (no extension in this listing). */
const UUID_NAME_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

class CleanupVideos {
  /**
   * @param {CleanupVideosOpts} opts
   */
  async run(opts) {
    const udid = opts.udid?.trim();
    if (!udid) {
      throw new Error('--udid is required');
    }

    await requirePlatformVersion(udid);

    const devicectl = new Devicectl(udid);
    const fileNames = [];
    const listErrors = [];
    let anyListSucceeded = false;
    for (const subdirectory of ATTACHMENT_SUBDIRECTORIES) {
      try {
        const names = await devicectl.listFiles(DOMAIN_TYPE, DOMAIN_IDENTIFIER, {
          username: USERNAME,
          subdirectory,
        });
        anyListSucceeded = true;
        fileNames.push(...names);
      } catch (err) {
        listErrors.push(err);
        log.debug(`Could not list ${subdirectory}: ${err.message ?? err}`);
      }
    }
    if (!anyListSucceeded) {
      const errorMessage = `Failed to list files in ${DOMAIN_TYPE}/${DOMAIN_IDENTIFIER}/` +
        `{${ATTACHMENT_SUBDIRECTORIES.join(',')}}`;
      throw new AggregateError(listErrors, errorMessage);
    }

    const uuids = filterAttachmentUuids([...new Set(fileNames)]);
    log.info(
      `Found ${util.pluralize('UUID-shaped attachment', uuids.length, true)} ` +
        `in testmanagerd Attachments and tmp/Attachments (out of ${fileNames.length} listed names).`,
    );
    if (uuids.length > 0) {
      log.info(uuids.join('\n'));
    }

    if (opts.dryRun) {
      log.info('Dry run: no deletion performed.');
      return;
    }

    if (uuids.length === 0) {
      log.info('Nothing to delete.');
      return;
    }

    const attachment = new XCTestAttachment(udid);
    await attachment.delete(uuids);
    log.info(`Deleted ${util.pluralize('attachment', uuids.length, true)}.`);
  }
}

/**
 * Reads the device OS version from `xcrun devicectl list devices` (via **node-devicectl**) and
 * throws unless it is **iOS 18+** (attachment deletion is only supported there).
 *
 * @param {string} udid
 * @returns {Promise<void>}
 */
async function requirePlatformVersion(udid) {
  let devices;
  try {
    devices = await new Devicectl('').listDevices();
  } catch (err) {
    throw new Error(
      `Could not list devices via devicectl. Ensure Xcode 15+ and a working \`xcrun devicectl list devices\`.`,
      {cause: err},
    );
  }
  const d = devices.find(
    (x) => x.hardwareProperties?.udid === udid || x.identifier === udid,
  );
  const platformVersion = d?.deviceProperties?.osVersionNumber;
  if (!platformVersion) {
    throw new Error(
      `Device '${udid}' was not found in devicectl output, or OS version is missing.`,
    );
  }
  if (!util.compareVersions(platformVersion, '>=', '18.0')) {
    throw new Error(
      `Attachment deletion requires iOS 18+. Device reports '${platformVersion}' (from devicectl).`,
    );
  }
}

/**
 * @param {string[]} names
 * @returns {string[]}
 */
function filterAttachmentUuids(names) {
  return names.filter((n) => typeof n === 'string' && UUID_NAME_RE.test(n.trim()));
}

async function main() {
  const cleanup = new CleanupVideos();
  const program = new Command();
  program
    .name('appium driver run xcuitest cleanup-videos')
    .description(
      'List and delete XCTest screen-recording attachment UUIDs on a real device (iOS 18+, tunnel + remotexpc).',
    )
    .requiredOption('--udid <udid>', 'device UDID (Core Device / devicectl)')
    .option('--dry-run', 'list UUIDs only; do not delete', false)
    .action(async (options) => {
      await cleanup.run(options);
    });

  await program.parseAsync(process.argv);
}

await main();

/**
 * Commander-derived options for {@link CleanupVideos.prototype.run}.
 *
 * @typedef {object} CleanupVideosOpts
 * @property {string} udid
 * @property {boolean} [dryRun]
 */
