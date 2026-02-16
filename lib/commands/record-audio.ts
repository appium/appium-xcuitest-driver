import {fs, tempDir, logger, util} from 'appium/support';
import {SubProcess} from 'teen_process';
import {encodeBase64OrUpload} from '../utils';
import {waitForCondition} from 'asyncbox';
import type {XCUITestDriver} from '../driver';
import type {AudioRecorderOptions} from './types';

const MAX_RECORDING_TIME_SEC = 43200;
const AUDIO_RECORD_FEAT_NAME = 'audio_record';
const DEFAULT_SOURCE = 'avfoundation';
const PROCESS_STARTUP_TIMEOUT_MS = 5000;

const DEFAULT_EXT = '.mp4';
const FFMPEG_BINARY = 'ffmpeg';
const ffmpegLogger = logger.getLogger(FFMPEG_BINARY);

export class AudioRecorder {
  private readonly input: string | number;
  private readonly log: any;
  private readonly audioPath: string;
  private readonly opts: AudioRecorderOptions;
  private mainProcess: SubProcess | null;

  constructor(
    input: string | number,
    log: any,
    audioPath: string,
    opts: AudioRecorderOptions = {} as AudioRecorderOptions,
  ) {
    this.input = input;
    this.log = log;
    this.audioPath = audioPath;
    this.opts = opts;
    this.mainProcess = null;
  }

  async start(timeoutSeconds: number): Promise<void> {
    try {
      await fs.which(FFMPEG_BINARY);
    } catch {
      throw new Error(
        `'${FFMPEG_BINARY}' binary is not found in PATH. Install it using 'brew install ffmpeg'. ` +
          `Check https://www.ffmpeg.org/download.html for more details.`,
      );
    }

    const {audioSource, audioCodec, audioBitrate, audioChannels, audioRate} = this.opts;

    const args = [
      '-t',
      `${timeoutSeconds}`,
      '-f',
      audioSource,
      '-i',
      String(this.input),
      '-c:a',
      audioCodec,
      '-b:a',
      audioBitrate,
      '-ac',
      `${audioChannels}`,
      '-ar',
      `${audioRate}`,
      this.audioPath,
    ];

    this.mainProcess = new SubProcess(FFMPEG_BINARY, args);
    let isCaptureStarted = false;
    this.mainProcess.on('output', (stdout, stderr) => {
      if (stderr) {
        if (stderr.trim().startsWith('size=')) {
          if (!isCaptureStarted) {
            isCaptureStarted = true;
          }
        } else {
          ffmpegLogger.info(`${stderr}`);
        }
      }
    });
    await this.mainProcess.start(0);
    try {
      await waitForCondition(() => isCaptureStarted, {
        waitMs: PROCESS_STARTUP_TIMEOUT_MS,
        intervalMs: 300,
      });
    } catch {
      this.log.warn(
        `Audio recording process did not start within ${PROCESS_STARTUP_TIMEOUT_MS}ms. Continuing anyway`,
      );
    }
    if (!this.mainProcess.isRunning) {
      this.mainProcess = null;
      throw new Error(
        `The audio recording process '${FFMPEG_BINARY}' died unexpectedly. ` +
          `Check server logs for more details`,
      );
    }
    this.log.info(
      `Starting capture on audio input '${this.input}' with command: '${util.quote([
        FFMPEG_BINARY,
        ...args,
      ])}'. ` + `Will timeout in ${timeoutSeconds}s`,
    );
    this.mainProcess.once('exit', (code, signal) => {
      // ffmpeg returns code 255 if SIGINT arrives
      if ([0, 255].includes(code ?? 0)) {
        this.log.info(`The recording session on audio input '${this.input}' has been finished`);
      } else {
        this.log.debug(
          `The recording session on audio input '${this.input}' has exited ` +
            `with code ${code}, signal ${signal}`,
        );
      }
    });
  }

  isRecording(): boolean {
    return !!this.mainProcess?.isRunning;
  }

  async interrupt(force = false): Promise<boolean> {
    if (this.isRecording()) {
      const interruptPromise = this.mainProcess?.stop(force ? 'SIGTERM' : 'SIGINT');
      this.mainProcess = null;
      try {
        await interruptPromise;
      } catch (e: any) {
        this.log.warn(
          `Cannot ${force ? 'terminate' : 'interrupt'} ${FFMPEG_BINARY}. ` +
            `Original error: ${e.message}`,
        );
        return false;
      }
    }

    return true;
  }

  async finish(): Promise<string> {
    await this.interrupt();
    return this.audioPath;
  }

  async cleanup(): Promise<void> {
    if (await fs.exists(this.audioPath)) {
      await fs.rimraf(this.audioPath);
    }
  }
}

/**
 * Records the given hardware audio input and saves it into an `.mp4` file.
 *
 * **To use this command, the `audio_record` security feature must be enabled _and_ [FFMpeg](https://ffmpeg.org/) must be installed on the Appium server.**
 *
 * @param audioInput - The name of the corresponding audio input device to use for the capture. The full list of capture devices could be shown by executing `ffmpeg -f avfoundation -list_devices true -i ""`
 * @param timeLimit - The maximum recording time, in seconds.
 * @param audioCodec - The name of the audio codec.
 * @param audioBitrate - The bitrate of the resulting audio stream.
 * @param audioChannels - The count of audio channels in the resulting stream. Setting it to `1` will create a single channel (mono) audio stream.
 * @param audioRate - The sampling rate of the resulting audio stream (in Hz).
 * @param forceRestart - Whether to restart audio capture process forcefully when `mobile: startRecordingAudio` is called (`true`) or ignore the call until the current audio recording is completed (`false`).
 * @group Real Device Only
 */
export async function startAudioRecording(
  this: XCUITestDriver,
  audioInput: string | number,
  timeLimit: string | number = 180,
  audioCodec = 'aac',
  audioBitrate = '128k',
  audioChannels: string | number = 2,
  audioRate: string | number = 44100,
  forceRestart = false,
): Promise<void> {
  if (!this.isFeatureEnabled(AUDIO_RECORD_FEAT_NAME)) {
    throw this.log.errorWithException(
      `Audio capture feature must be enabled on the server side. ` +
        `Please set '--relaxed-security' or '--allow-insecure' with '${AUDIO_RECORD_FEAT_NAME}' option. ` +
        `Read https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/security.md for more details.`,
    );
  }
  if (!audioInput) {
    throw this.log.errorWithException(
      `The mandatory audioInput option is not provided. Please set it ` +
        `to a correct value (e. g. ':1'). Use 'ffmpeg -f avfoundation -list_devices true -i ""' ` +
        `command to list available input sources`,
    );
  }

  if (this._audioRecorder?.isRecording()) {
    this.log.info(`There is an active audio recording process`);
    if (forceRestart) {
      this.log.info(`Stopping it because 'forceRestart' option is set to true`);
      await this._audioRecorder.interrupt(true);
    } else {
      this.log.info(
        `Doing nothing. ` +
          `Set 'forceRestart' option to true if you'd like to start a new audio recording session`,
      );
      return;
    }
  }
  if (this._audioRecorder) {
    await this._audioRecorder.cleanup();
    this._audioRecorder = null;
  }

  const audioPath = await tempDir.path({
    prefix: `appium_${util.uuidV4().substring(0, 8)}`,
    suffix: DEFAULT_EXT,
  });

  const audioRecorder = new AudioRecorder(audioInput, this.log, audioPath, {
    audioSource: DEFAULT_SOURCE,
    audioCodec,
    audioBitrate,
    audioChannels: Number(audioChannels),
    audioRate: Number(audioRate),
  });

  const timeoutSeconds = parseInt(String(timeLimit), 10);
  if (isNaN(timeoutSeconds) || timeoutSeconds > MAX_RECORDING_TIME_SEC || timeoutSeconds <= 0) {
    throw this.log.errorWithException(
      `The timeLimit value must be in range [1, ${MAX_RECORDING_TIME_SEC}] seconds. ` +
        `The value of '${timeLimit}' has been passed instead.`,
    );
  }

  try {
    await audioRecorder.start(timeoutSeconds);
  } catch (e) {
    await audioRecorder.interrupt(true);
    await audioRecorder.cleanup();
    throw e;
  }
  this._audioRecorder = audioRecorder;
}

/**
 * Stop recording of the audio input. If no audio recording process is running then
 * the endpoint will try to get the recently recorded file.
 * If no previously recorded file is found and no active audio recording
 * processes are running then the method returns an empty string.
 *
 * @returns Base64-encoded content of the recorded media file or an
 * empty string if no audio recording has been started before.
 * @throws {Error} If there was an error while getting the recorded file.
 */
export async function stopAudioRecording(this: XCUITestDriver): Promise<string> {
  if (!this._audioRecorder) {
    this.log.info('Audio recording has not been started. There is nothing to stop');
    return '';
  }

  let resultPath: string;
  try {
    resultPath = await this._audioRecorder.finish();
    if (!(await fs.exists(resultPath))) {
      throw this.log.errorWithException(
        `${FFMPEG_BINARY} has failed ` + `to store the actual audio recording at '${resultPath}'`,
      );
    }
  } catch (e) {
    await this._audioRecorder.interrupt(true);
    await this._audioRecorder.cleanup();
    this._audioRecorder = null;
    throw e;
  }
  return await encodeBase64OrUpload(resultPath);
}
