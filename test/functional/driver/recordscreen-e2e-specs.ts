import {expect} from 'chai';
import {createServer, type Server, type IncomingMessage, type ServerResponse} from 'node:http';
import {fs, tempDir} from 'appium/support';
import {exec} from 'teen_process';
import {ScreenRecorder} from '../../../lib/commands/recordscreen';

const JPEG_1X1_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
    'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
    'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
    'MjIyMjL/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAd' +
    'EAACAQQDAAAAAAAAAAAAAAABAgMABAURBhIh/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwT/' +
    'xAAXEQEAAwAAAAAAAAAAAAAAAAAAAREx/9oADAMBAAIRAxEAPwCqg6fM2U8R6y9I2x5R' +
    'kB9fLr9K6Z6xkKSlwB8j5mP/Z',
  'base64',
);

describe('ScreenRecorder', function () {
  let mjpegServer: Server;
  let streamTimer: NodeJS.Timeout;
  let videoPath: string;
  let recorder: ScreenRecorder;
  let port: number;
  /** Resolved in `before`; same binary ScreenRecorder uses when tests run. */
  let ffmpegPath!: string;

  before(async function () {
    try {
      ffmpegPath = await fs.which('ffmpeg');
    } catch {
      // ffmpeg missing from PATH; ScreenRecorder requires it (see brew install ffmpeg).
      this.skip();
    }
  });

  beforeEach(async function () {
    videoPath = await tempDir.path({prefix: 'screen-recorder-test-', suffix: '.mp4'});

    mjpegServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url !== '/') {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked',
      });
      streamTimer = setInterval(() => {
        // ffmpeg with `-f mjpeg` accepts a concatenated stream of JPEG images.
        res.write(JPEG_1X1_BUFFER);
      }, 100);
    });

    await new Promise<void>((resolve) => {
      mjpegServer.listen(0, '127.0.0.1', () => resolve());
    });
    port = (mjpegServer.address() as {port: number}).port;

    recorder = new ScreenRecorder(
      'fake-udid',
      {
        info() {},
        warn() {},
      },
      videoPath,
      {
        remotePort: port,
        remoteUrl: 'http://127.0.0.1',
        videoType: 'libx264',
        videoFps: 10,
        videoScale: '128:128',
        pixelFormat: 'yuv420p',
      },
    );
  });

  afterEach(async function () {
    if (streamTimer) {
      clearInterval(streamTimer);
    }
    if (recorder) {
      await recorder.interrupt(true);
      await recorder.cleanup();
    }
    if (mjpegServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        mjpegServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('records from mjpeg stream and keeps non-empty video after interrupt', async function () {
    await recorder.start(15000);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const didInterrupt = await recorder.interrupt();
    expect(didInterrupt).to.equal(true);

    const exists = await fs.exists(videoPath);
    expect(exists).to.equal(true);
    const {size} = await fs.stat(videoPath);
    expect(size).to.be.greaterThan(0);

    await exec(ffmpegPath, [
      '-hide_banner',
      '-nostdin',
      '-v',
      'error',
      '-i',
      videoPath,
      '-f',
      'null',
      '-',
    ]);
  });
});
