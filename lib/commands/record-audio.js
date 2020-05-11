import { fs, tempDir, logger, util } from 'appium-support';
import { SubProcess } from 'teen_process';
import log from '../logger';
import { encodeBase64OrUpload } from '../utils';
import { waitForCondition } from 'asyncbox';


const commands = {};

const AUDIO_RECORD_FEAT_NAME = 'audio_record';
const MAX_RECORDING_TIME_SEC = 60 * 60 * 12;
const DEFAULT_RECORDING_TIME_SEC = 60 * 3;
const PROCESS_STARTUP_TIMEOUT_MS = 5000;
const DEFAULT_SOURCE = 'avfoundation';
const DEFAULT_BITRATE = '128k';
const DEFAULT_CODEC = 'aac';
const DEFAULT_CHANNELS = 2;
const DEFAULT_RATE = 44100;
const DEFAULT_EXT = '.mp4';
const FFMPEG_BINARY = 'ffmpeg';
const ffmpegLogger = logger.getLogger(FFMPEG_BINARY);


class AudioRecorder {
  constructor (input, audioPath, opts = {}) {
    this.audioPath = audioPath;
    this.opts = opts;
    this.input = input;
    this.mainProcess = null;
  }

  async start (timeoutSeconds) {
    try {
      await fs.which(FFMPEG_BINARY);
    } catch (err) {
      throw new Error(`'${FFMPEG_BINARY}' binary is not found in PATH. Install it using 'brew install ffmpeg'. ` +
        `Check https://www.ffmpeg.org/download.html for more details.`);
    }

    const {
      audioSource = DEFAULT_SOURCE,
      audioCodec,
      audioBitrate,
      audioChannels,
      audioRate,
    } = this.opts;

    const args = [
      '-t', `${timeoutSeconds}`,
      '-f', audioSource,
      '-i', this.input,
      '-c:a', audioCodec,
      '-b:a', audioBitrate,
      '-ac', `${audioChannels}`,
      '-ar', `${audioRate}`,
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
    } catch (e) {
      log.warn(`Audio recording process did not start within ${PROCESS_STARTUP_TIMEOUT_MS}ms. Continuing anyway`);
    }
    if (!this.mainProcess.isRunning) {
      this.mainProcess = null;
      throw new Error(`The audio recording process '${FFMPEG_BINARY}' died unexpectedly. ` +
        `Check server logs for more details`);
    }
    log.info(`Starting capture on audio input '${this.input}' with command: '${util.quote([FFMPEG_BINARY, ...args])}'. ` +
      `Will timeout in ${timeoutSeconds}s`);
    this.mainProcess.once('exit', (code, signal) => {
      // ffmpeg returns code 255 if SIGINT arrives
      if ([0, 255].includes(code)) {
        log.info(`The recording session on audio input '${this.input}' has been finished`);
      } else {
        log.debug(`The recording session on audio input '${this.input}' has exited ` +
          `with code ${code}, signal ${signal}`);
      }
    });
  }

  isRecording () {
    return !!(this.mainProcess?.isRunning);
  }

  async interrupt (force = false) {
    if (this.isRecording()) {
      const interruptPromise = this.mainProcess.stop(force ? 'SIGTERM' : 'SIGINT');
      this.mainProcess = null;
      try {
        await interruptPromise;
      } catch (e) {
        log.warn(`Cannot ${force ? 'terminate' : 'interrupt'} ${FFMPEG_BINARY}. ` +
          `Original error: ${e.message}`);
        return false;
      }
    }

    return true;
  }

  async finish () {
    await this.interrupt();
    return this.audioPath;
  }

  async cleanup () {
    if (await fs.exists(this.audioPath)) {
      await fs.rimraf(this.audioPath);
    }
  }
}


/**
 * @typedef {Object} StartRecordingOptions
 *
 * @property {!string} audioInput - The name of the corresponding audio input device to use for the
 * capture. The full list of capture devices could be shown using `ffmpeg -f avfoundation -list_devices true -i ""`
 * Terminal command.
 * @property {?string} audioCodec [aac] - The name of the audio codec. The Advanced Audio Codec is used by default.
 * @property {?string} audioBitrate [128k] - The bitrate of the resulting audio stream. 128k by default.
 * @property {?string|number} audioChannels [2] - The count of audio channels in the resulting stream. Setting it to `1`
 * will create a single channel (mono) audio stream.
 * @property {?string|number} audioRate [44100] - The sampling rate of the resulting audio stream.
 * @property {?string|number} timeLimit [180] - The maximum recording time, in seconds.
 * The default value is 180, the maximum value is 43200 (12 hours).
 * @property {?boolean} forceRestart [false] - Whether to restart audio capture process forcefully when
 * startRecordingAudio is called (`true`) or ignore the call until the current audio recording is completed.
 */

/**
 * Records the given hardware audio input into an .mp4 file.
 *
 * @param {?StartRecordingOptions} options - The available options.
 * @throws {Error} If audio recording has failed to start.
 */
commands.startAudioRecording = async function startAudioRecording (options = {}) {
  if (!this.isFeatureEnabled(AUDIO_RECORD_FEAT_NAME)) {
    log.errorAndThrow(`Audio capture feature must be enabled on the server side. ` +
      `Please set '--relaxed-security' or '--allow-insecure' with '${AUDIO_RECORD_FEAT_NAME}' option. ` +
      `Read https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/security.md for more details.`);
  }

  const {
    timeLimit = DEFAULT_RECORDING_TIME_SEC,
    audioInput,
    // Undocumented feature
    audioSource,
    audioCodec = DEFAULT_CODEC,
    audioBitrate = DEFAULT_BITRATE,
    audioChannels = DEFAULT_CHANNELS,
    audioRate = DEFAULT_RATE,
    forceRestart,
  } = options;

  if (!audioInput) {
    log.errorAndThrow(`The mandatory audioInput option is not provided. Please set it ` +
      `to a correct value (e. g. ':1'). Use 'ffmpeg -f avfoundation -list_devices true -i ""' ` +
      `command to list available input sources`);
  }

  if (this._audioRecorder?.isRecording()) {
    log.info(`There is an active audio recording process`);
    if (forceRestart) {
      log.info(`Stopping it because 'forceRestart' option is set to true`);
      await this._audioRecorder.interrupt(true);
    } else {
      log.info(`Doing nothing. ` +
        `Set 'forceRestart' option to true if you'd like to start a new audio recording session`);
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

  const audioRecorder = new AudioRecorder(audioInput, audioPath, {
    audioSource,
    audioCodec,
    audioBitrate,
    audioChannels,
    audioRate,
  });

  const timeoutSeconds = parseInt(timeLimit, 10);
  if (isNaN(timeoutSeconds) || timeoutSeconds > MAX_RECORDING_TIME_SEC || timeoutSeconds <= 0) {
    log.errorAndThrow(`The timeLimit value must be in range [1, ${MAX_RECORDING_TIME_SEC}] seconds. ` +
      `The value of '${timeLimit}' has been passed instead.`);
  }

  try {
    await audioRecorder.start(timeoutSeconds);
  } catch (e) {
    await audioRecorder.interrupt(true);
    await audioRecorder.cleanup();
    throw e;
  }
  this._audioRecorder = audioRecorder;
};

/**
 * Stop recording of the audio input. If no audio recording process is running then
 * the endpoint will try to get the recently recorded file.
 * If no previously recorded file is found and no active audio recording
 * processes are running then the method returns an empty string.
 *
 * @returns {string} Base64-encoded content of the recorded media file or an
 * empty string if no audio recording has been started before.
 * @throws {Error} If there was an error while getting the recorded file.
 */
commands.stopAudioRecording = async function stopAudioRecording () {
  if (!this._audioRecorder) {
    log.info('Audio recording has not been started. There is nothing to stop');
    return '';
  }

  let resultPath;
  try {
    resultPath = await this._audioRecorder.finish();
    if (!await fs.exists(resultPath)) {
      log.errorAndThrow(`${FFMPEG_BINARY} has failed ` +
        `to store the actual audio recording at '${resultPath}'`);
    }
  } catch (e) {
    await this._audioRecorder.interrupt(true);
    await this._audioRecorder.cleanup();
    this._audioRecorder = null;
    throw e;
  }
  return await encodeBase64OrUpload(resultPath);
};


export { commands };
export default commands;
