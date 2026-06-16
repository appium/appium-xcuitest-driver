import {fs, util} from 'appium/support';
import {encodeBase64OrUpload} from './helpers';
import os from 'node:os';
import path from 'node:path';
import type {XCUITestDriver} from '../driver';
import type {Simulator} from 'appium-ios-simulator';
import type {RealDevice} from '../device/real-device-management';
import type {AppiumLogger, HTTPHeaders} from '@appium/types';
import type {XcTestScreenRecordingInfo, XcTestScreenRecording} from './types';
import {XctestAttachmentDeletionClient} from '../device/xctest-attachment-deletion-client';
import {formatTunnelAvailabilityMessage, isTunnelAvailabilityError} from '../device/remote-xpc';

const MOV_EXT = '.mov';
/**
 * On simulators XCTest stores screen recording attachments under
 * `InternalDaemon/<id>/Attachments/<uuid>` (legacy) or
 * `InternalDaemon/<id>/tmp/Attachments/<uuid>` (Xcode 26.5+).
 * Brace `{,tmp/}` matches both in a single glob.
 */
const SIMULATOR_XCTEST_RECORDING_ATTACHMENT_GLOB = '*/{,tmp/}Attachments/*';
/** Insecure feature when real-device XCTest recording is used without RemoteXPC attachment deletion. */
const XCTEST_SCREEN_RECORD_FEATURE = 'xctest_screen_record';
const DOMAIN_IDENTIFIER = 'com.apple.testmanagerd';
const DOMAIN_TYPE = 'appDataContainer';
const USERNAME = 'mobile';
/** Legacy layout and Xcode 26.5+ `tmp/Attachments` within testmanagerd's app data container. */
const REAL_DEVICE_XCTEST_ATTACHMENT_SUBDIRECTORIES = ['Attachments', 'tmp/Attachments'] as const;

abstract class XcTestScreenRecordingRetriever {
  constructor(protected readonly log: AppiumLogger) {}

  protected static nameMatchesUuid(name: string, uuid: string): boolean {
    return name.toUpperCase() === uuid.toUpperCase();
  }

  abstract retrieve(uuid: string): Promise<string>;
}

class SimulatorXcTestScreenRecordingRetriever extends XcTestScreenRecordingRetriever {
  constructor(
    private readonly device: Simulator,
    log: AppiumLogger,
  ) {
    super(log);
  }

  override async retrieve(uuid: string): Promise<string> {
    const dataRoot = this.device.getDir();
    // e.g. .../CoreSimulator/Devices/<udid>/data/Containers/Data/InternalDaemon/<daemon-id>/Attachments/<uuid>
    // or .../InternalDaemon/<daemon-id>/tmp/Attachments/<uuid> (Xcode 26.5+)
    const internalDaemonRoot = path.resolve(dataRoot, 'Containers', 'Data', 'InternalDaemon');
    const attachmentPaths = await fs.glob(SIMULATOR_XCTEST_RECORDING_ATTACHMENT_GLOB, {
      cwd: internalDaemonRoot,
      absolute: true,
    });
    const videoPath = attachmentPaths.find((fp) =>
      XcTestScreenRecordingRetriever.nameMatchesUuid(path.basename(fp), uuid),
    );
    if (!videoPath) {
      throw new Error(
        `Unable to locate XCTest screen recording identified by '${uuid}' for the Simulator ${this.device.udid}`,
      );
    }
    const {size} = await fs.stat(videoPath);
    this.log.debug(`Located the video at '${videoPath}' (${util.toReadableSizeString(size)})`);
    return videoPath;
  }
}

class RealDeviceXcTestScreenRecordingRetriever extends XcTestScreenRecordingRetriever {
  constructor(
    private readonly device: RealDevice,
    private readonly tmpDir: string,
    log: AppiumLogger,
  ) {
    super(log);
  }

  override async retrieve(uuid: string): Promise<string> {
    const attachment = await this.findAttachment(uuid);
    if (!attachment) {
      throw new Error(
        `Unable to locate XCTest screen recording identified by '${uuid}' for the device ${this.device.udid}`,
      );
    }
    const videoPath = path.join(this.tmpDir, `${uuid}${MOV_EXT}`);
    const {subdirectory, fileName} = attachment;
    await this.device.devicectl.pullFile(`${subdirectory}/${fileName}`, videoPath, {
      username: USERNAME,
      domainIdentifier: DOMAIN_IDENTIFIER,
      domainType: DOMAIN_TYPE,
    });
    const {size} = await fs.stat(videoPath);
    this.log.debug(`Pulled the video to '${videoPath}' (${util.toReadableSizeString(size)})`);
    return videoPath;
  }

  private async findAttachment(
    uuid: string,
  ): Promise<{subdirectory: string; fileName: string} | null> {
    for (const subdirectory of REAL_DEVICE_XCTEST_ATTACHMENT_SUBDIRECTORIES) {
      let fileNames: string[];
      try {
        fileNames = await this.device.devicectl.listFiles(DOMAIN_TYPE, DOMAIN_IDENTIFIER, {
          username: USERNAME,
          subdirectory,
        });
      } catch {
        continue;
      }
      const fileName = fileNames.find((name) =>
        XcTestScreenRecordingRetriever.nameMatchesUuid(name, uuid),
      );
      if (fileName) {
        return {subdirectory, fileName};
      }
    }
    return null;
  }
}

/**
 * Start a new screen recording via XCTest.
 *
 * On **real devices**, if **iOS 18+** and a new enough **appium-ios-remotexpc** (with
 * **XCTestAttachment**) are present, the attachment is removed after stop and the
 * `xctest_screen_record` insecure feature is **not** required.
 * If deletion cannot be performed (older iOS, package missing, or too old), you must enable
 * the `xctest_screen_record` insecure feature to start recording.
 *
 * If the recording is already running this API is a noop.
 *
 * @since Xcode 15/iOS 17
 * @param fps - FPS value
 * @param codec - Video codec, where 0 is h264, 1 is HEVC
 * @returns The information about a newly created or a running the screen recording.
 * @throws {Error} If screen recording has failed to start.
 */
export async function mobileStartXctestScreenRecording(
  this: XCUITestDriver,
  fps?: number,
  codec?: number,
): Promise<XcTestScreenRecordingInfo> {
  if (this.isRealDevice()) {
    const canDeleteAfterStop = (await this.remoteXPCFacade?.determineAvailability()) ?? false;
    if (!canDeleteAfterStop) {
      this.assertFeatureEnabled(XCTEST_SCREEN_RECORD_FEATURE);
    }
  }

  const opts: {codec?: number; fps?: number} = {};
  if (Number.isInteger(codec)) {
    opts.codec = codec;
  }
  if (Number.isInteger(fps)) {
    opts.fps = fps;
  }
  const response = (await this.proxyCommand(
    '/wda/video/start',
    'POST',
    opts,
  )) as XcTestScreenRecordingInfo;
  this.log.info(`Started a new screen recording: ${JSON.stringify(response)}`);
  return response;
}

/**
 * Retrieves information about the current running screen recording.
 * If no screen recording is running then `null` is returned.
 */
export async function mobileGetXctestScreenRecordingInfo(
  this: XCUITestDriver,
): Promise<XcTestScreenRecordingInfo | null> {
  return (await this.proxyCommand('/wda/video', 'GET')) as XcTestScreenRecordingInfo | null;
}

/**
 * Stop screen recording previously started by mobileStartXctestScreenRecording API.
 *
 * An error is thrown if no screen recording is running.
 *
 * The resulting movie is returned as base-64 string or is uploaded to
 * a remote location if corresponding options have been provided.
 *
 * The resulting movie is automatically deleted from the host temp file FOR SIMULATORS ONLY.
 * On **real devices**, after a successful pull the driver removes the XCTest attachment via
 * **appium-ios-remotexpc** when the same conditions hold as for starting without
 * `xctest_screen_record` (iOS 18+, package present, **XCTestAttachment** export). Otherwise
 * device-side delete is skipped. That deletion runs even if Base64 encoding or remote upload
 * fails afterward (the original encode/upload error is still thrown); if both fail, delete errors
 * are logged as warnings so the encode/upload failure remains primary.
 *
 * @since Xcode 15/iOS 17
 * @param remotePath - The path to the remote location, where the resulting video should be
 * uploaded.
 * The following protocols are supported: `http`, `https`, `ftp`. Null or empty
 * string value (the default setting) means the content of resulting file
 * should be encoded as Base64 and passed as the endpoint response value. An
 * exception will be thrown if the generated media file is too big to fit into
 * the available process memory.
 * @param user - The name of the user for the remote authentication.
 * Only works if `remotePath` is provided.
 * @param pass - The password for the remote authentication.
 * Only works if `remotePath` is provided.
 * @param headers - Additional headers mapping for multipart http(s) uploads
 * @param fileFieldName - The name of the form field where the file content BLOB should be stored for
 * http(s) uploads
 * @param formFields - Additional form fields for multipart http(s) uploads
 * @param method - The http multipart upload method name.
 * Only works if `remotePath` is provided.
 * @returns The resulting movie with base64-encoded content or empty string if uploaded remotely.
 * @throws {Error} If there was an error while retrieving the video
 * file or the file content cannot be uploaded to the remote location.
 */
export async function mobileStopXctestScreenRecording(
  this: XCUITestDriver,
  remotePath?: string,
  user?: string,
  pass?: string,
  headers?: HTTPHeaders,
  fileFieldName?: string,
  formFields?: Record<string, any> | [string, any][],
  method: 'PUT' | 'POST' | 'PATCH' = 'PUT',
): Promise<XcTestScreenRecording> {
  const screenRecordingInfo = await this.mobileGetXctestScreenRecordingInfo();
  if (!screenRecordingInfo) {
    throw new Error('There is no active screen recording. Did you start one beforehand?');
  }

  this.log.debug(`Stopping the active screen recording: ${JSON.stringify(screenRecordingInfo)}`);
  await this.proxyCommand('/wda/video/stop', 'POST', {});
  const videoPath = await createXcTestScreenRecordingRetriever(this).retrieve(
    screenRecordingInfo.uuid,
  );
  const result: XcTestScreenRecording = {
    ...screenRecordingInfo,
    payload: '', // Will be set below
  };
  let encodeOrUploadError: unknown;
  let attachmentDeleteError: unknown;
  try {
    result.payload = await encodeBase64OrUpload(videoPath, remotePath, {
      user,
      pass,
      headers,
      fileFieldName,
      formFields,
      method,
    });
  } catch (err) {
    encodeOrUploadError = err;
  } finally {
    await fs.rimraf(videoPath);
    if (this.remoteXPCFacade?.eligible) {
      try {
        const deletionClient = new XctestAttachmentDeletionClient(this.remoteXPCFacade);
        await deletionClient.deleteAttachmentsByUuid([screenRecordingInfo.uuid]);
      } catch (deleteErr: any) {
        if (encodeOrUploadError === undefined) {
          if (
            this.isFeatureEnabled(XCTEST_SCREEN_RECORD_FEATURE) &&
            isTunnelAvailabilityError(deleteErr)
          ) {
            this.log.warn(
              `Could not delete XCTest attachment on device: ${formatTunnelAvailabilityMessage(deleteErr)}`,
            );
          } else {
            attachmentDeleteError = deleteErr;
          }
        } else {
          this.log.warn(
            `Could not delete XCTest attachment on device (encode/upload had already failed): ${
              deleteErr?.message ?? deleteErr
            }`,
          );
        }
      }
    }
  }

  if (encodeOrUploadError !== undefined) {
    throw encodeOrUploadError;
  }
  if (attachmentDeleteError !== undefined) {
    throw attachmentDeleteError;
  }

  return result;
}

function createXcTestScreenRecordingRetriever(
  driver: XCUITestDriver,
): XcTestScreenRecordingRetriever {
  if (driver.isRealDevice()) {
    return new RealDeviceXcTestScreenRecordingRetriever(
      driver.device as RealDevice,
      driver.opts.tmpDir || os.tmpdir(),
      driver.log,
    );
  }
  return new SimulatorXcTestScreenRecordingRetriever(driver.device as Simulator, driver.log);
}
