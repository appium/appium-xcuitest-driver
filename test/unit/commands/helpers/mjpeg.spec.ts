import assert from 'node:assert/strict';
import http, {type Server} from 'node:http';
import {describe, it, before, beforeEach, afterEach} from 'node:test';

import sharp from 'sharp';
import {createSandbox} from 'sinon';
import type sinon from 'sinon';

import {
  allocateMjpegServerPort,
  handleMjpegOptions,
  MjpegFrameParser,
  MJpegStream,
} from '../../../../lib/commands/helpers/mjpeg.js';
import type {XCUITestDriver} from '../../../../lib/driver.js';
import {UNIT_LONG_TIMEOUT_MS} from '../../helpers.js';

function buildMultipartFrame(jpeg: Buffer): Buffer {
  const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header), jpeg, Buffer.from('\r\n')]);
}

describe('mjpeg helpers', function () {
  describe('MJpegStream', function () {
    let jpeg: Buffer;
    let jpeg2: Buffer;
    let server: Server;
    let serverUrl: string;
    let framesToSend: Buffer[];
    let frameIntervalMs: number;
    let stream: MJpegStream | null;

    before(async function () {
      jpeg = await sharp({
        create: {width: 2, height: 2, channels: 3, background: {r: 255, g: 0, b: 0}},
      })
        .jpeg()
        .toBuffer();
      jpeg2 = await sharp({
        create: {width: 2, height: 2, channels: 3, background: {r: 0, g: 0, b: 255}},
      })
        .jpeg()
        .toBuffer();
    });

    beforeEach(async function () {
      framesToSend = [jpeg];
      frameIntervalMs = 10;
      stream = null;
      server = http.createServer((_req, res) => {
        res.writeHead(200, {'Content-Type': 'multipart/x-mixed-replace; boundary=frame'});
        res.flushHeaders();
        let sent = 0;
        const timer = setInterval(() => {
          if (sent >= framesToSend.length) {
            clearInterval(timer);
            return;
          }
          res.write(buildMultipartFrame(framesToSend[sent]));
          sent++;
        }, frameIntervalMs);
        res.on('close', () => clearInterval(timer));
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      serverUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async function () {
      stream?.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('should have no last chunk before start() is called', function () {
      stream = new MJpegStream(serverUrl);
      assert.strictEqual(stream.lastChunkBase64, null);
    });

    it('should capture the first JPEG frame once started', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
      stream = new MJpegStream(serverUrl);
      await stream.start();
      assert.strictEqual(stream.lastChunkBase64, jpeg.toString('base64'));
    });

    it('should convert the last chunk to a PNG', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
      stream = new MJpegStream(serverUrl);
      await stream.start();
      const pngBase64 = await stream.lastChunkPNGBase64();
      assert.notStrictEqual(pngBase64, null);
      const png = Buffer.from(pngBase64 as string, 'base64');
      // PNG signature
      assert.strictEqual(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    });

    it('should keep track of newer frames as they arrive', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
      framesToSend = [jpeg, jpeg2];
      frameIntervalMs = 20;
      stream = new MJpegStream(serverUrl);
      await stream.start();
      assert.strictEqual(stream.lastChunkBase64, jpeg.toString('base64'));
      await new Promise((resolve) => setTimeout(resolve, frameIntervalMs * framesToSend.length + 50));
      assert.strictEqual(stream.lastChunkBase64, jpeg2.toString('base64'));
    });

    it('should clear the last chunk on stop()', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
      stream = new MJpegStream(serverUrl);
      await stream.start();
      assert.notStrictEqual(stream.lastChunkBase64, null);
      stream.stop();
      assert.strictEqual(stream.lastChunkBase64, null);
    });

    it('should reject if the server cannot be reached', async function () {
      stream = new MJpegStream('http://127.0.0.1:1');
      await assert.rejects(stream.start(200), /Cannot connect to the MJPEG stream/);
    });

    it('should reject if no frame arrives before the timeout', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
      framesToSend = [];
      stream = new MJpegStream(serverUrl);
      // The server flushes headers immediately, so axios resolves well within the deadline;
      // the rejection comes from MJpegStream's own "no frame yet" guard.
      await assert.rejects(stream.start(300), /never sent any images/);
      // start() must not leak the underlying connection/pipes after failing.
      assert.strictEqual((stream as any).responseStream, null);
    });

    it('should reject quickly if the connection closes before any frame arrives', async function () {
      const closingServer = http.createServer((_req, res) => {
        res.writeHead(200, {'Content-Type': 'multipart/x-mixed-replace; boundary=frame'});
        res.end();
      });
      await new Promise<void>((resolve) => closingServer.listen(0, '127.0.0.1', resolve));
      try {
        const address = closingServer.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        stream = new MJpegStream(`http://127.0.0.1:${port}`);
        const startedAt = Date.now();
        // The server timeout is generous; the rejection must come from the close handler,
        // long before the timeout would otherwise fire.
        await assert.rejects(stream.start(20000), /has been closed/);
        assert.ok(Date.now() - startedAt < 5000);
        assert.strictEqual((stream as any).responseStream, null);
      } finally {
        await new Promise<void>((resolve) => closingServer.close(() => resolve()));
      }
    });
  });

  describe('MjpegFrameParser', function () {
    let parser: MjpegFrameParser;
    let frames: Buffer[];

    beforeEach(function () {
      parser = new MjpegFrameParser();
      frames = [];
      parser.on('data', (frame: Buffer) => frames.push(frame));
    });

    it('should not leak trailing zero bytes when Content-Length overstates the actual frame size', function (_t, done) {
      // Declares a 10-byte frame, but the actual SOI..EOI span is only 4 bytes.
      const chunk = Buffer.concat([Buffer.from('Content-Length: 10\r\n\r\n'), Buffer.from([0xff, 0xd8, 0xff, 0xd9])]);
      parser.write(chunk, () => {
        assert.strictEqual(frames.length, 1);
        assert.deepStrictEqual(frames[0], Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
        done();
      });
    });

    it('should not corrupt an already-emitted frame with a later stray SOI chunk lacking Content-Length', function (_t, done) {
      const firstFrame = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      const chunk1 = Buffer.concat([Buffer.from('Content-Length: 10\r\n\r\n'), firstFrame]);
      parser.write(chunk1, () => {
        assert.strictEqual(frames.length, 1);
        const emitted = frames[0];
        // No Content-Length header here on purpose: this must not be appended onto
        // the buffer that was already pushed downstream.
        const strayChunk = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0x03]);
        parser.write(strayChunk, () => {
          assert.strictEqual(frames.length, 1);
          assert.deepStrictEqual(emitted, firstFrame);
          done();
        });
      });
    });

    it('should not truncate the current frame when a later chunk also contains a stray SOI marker after the EOI', function (_t, done) {
      // Frame is split across two writes: the first only carries the SOI (2 of the 4
      // declared bytes), the second completes it with the EOI, followed by unrelated
      // trailing bytes that happen to look like another frame's SOI (no Content-Length
      // alongside them, so they must not be parsed as a new frame).
      const chunk1 = Buffer.concat([Buffer.from('Content-Length: 4\r\n\r\n'), Buffer.from([0xff, 0xd8])]);
      const chunk2 = Buffer.from([0xff, 0xd9, 0xff, 0xd8, 0x01]);
      parser.write(chunk1, () => {
        parser.write(chunk2, () => {
          assert.strictEqual(frames.length, 1);
          assert.deepStrictEqual(frames[0], Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
          done();
        });
      });
    });
  });

  describe('allocateMjpegServerPort', function () {
    let sandbox: sinon.SinonSandbox;

    beforeEach(function () {
      sandbox = createSandbox();
    });

    afterEach(function () {
      sandbox.restore();
    });

    function makeDriver(overrides: Partial<XCUITestDriver> = {}): XCUITestDriver {
      return {
        opts: {udid: 'device-1'},
        log: {
          info: sandbox.stub(),
          debug: sandbox.stub(),
          warn: sandbox.stub(),
        },
        isRealDevice: sandbox.stub().returns(false),
        remoteXPCFacade: undefined,
        deviceConnectionsFactory: {
          requestConnection: sandbox.stub().resolves(),
        },
        ...overrides,
      } as unknown as XCUITestDriver;
    }

    it('should forward the default port when mjpegServerPort is not set', async function () {
      const driver = makeDriver();
      await allocateMjpegServerPort(driver);
      assert.strictEqual(
        (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).calledWith('device-1', 9100, {
          devicePort: 9100,
          usePortForwarding: false,
          remoteXPCFacade: null,
        }),
        true,
      );
    });

    it('should forward the requested port when mjpegServerPort is set', async function () {
      const driver = makeDriver({opts: {udid: 'device-1', mjpegServerPort: 9200} as any});
      await allocateMjpegServerPort(driver);
      assert.strictEqual(
        (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).calledWith('device-1', 9200, {
          devicePort: 9200,
          usePortForwarding: false,
          remoteXPCFacade: null,
        }),
        true,
      );
    });

    it('should only warn if the default port cannot be forwarded', async function () {
      const driver = makeDriver();
      (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).rejects(new Error('port busy'));
      await allocateMjpegServerPort(driver);
      assert.strictEqual((driver.log.warn as sinon.SinonStub).calledWithMatch(/Certain features/), true);
    });

    it('should throw if a custom mjpegServerPort cannot be forwarded', async function () {
      const driver = makeDriver({opts: {udid: 'device-1', mjpegServerPort: 9200} as any});
      (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).rejects(new Error('port busy'));
      await assert.rejects(allocateMjpegServerPort(driver), /mjpegServerPort.*port busy/);
    });

    it('should request a real-device connection with remoteXPCFacade when applicable', async function () {
      const remoteXPCFacade = {fake: true};
      const driver = makeDriver({
        isRealDevice: sandbox.stub().returns(true),
        remoteXPCFacade: remoteXPCFacade as any,
      });
      await allocateMjpegServerPort(driver);
      assert.strictEqual(
        (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).calledWith('device-1', 9100, {
          devicePort: 9100,
          usePortForwarding: true,
          remoteXPCFacade,
        }),
        true,
      );
    });
  });

  describe('handleMjpegOptions', function () {
    let sandbox: sinon.SinonSandbox;
    let startStub: sinon.SinonStub;

    beforeEach(function () {
      sandbox = createSandbox();
      startStub = sandbox.stub(MJpegStream.prototype, 'start').resolves();
    });

    afterEach(function () {
      sandbox.restore();
    });

    function makeDriver(overrides: Partial<XCUITestDriver> = {}): XCUITestDriver {
      return {
        opts: {udid: 'device-1'},
        log: {
          info: sandbox.stub(),
          debug: sandbox.stub(),
          warn: sandbox.stub(),
        },
        isRealDevice: sandbox.stub().returns(false),
        remoteXPCFacade: undefined,
        deviceConnectionsFactory: {
          requestConnection: sandbox.stub().resolves(),
        },
        ...overrides,
      } as unknown as XCUITestDriver;
    }

    it('should not create a stream if mjpegScreenshotUrl is not set', async function () {
      const driver = makeDriver();
      await handleMjpegOptions(driver);
      assert.strictEqual(driver.mjpegStream, undefined);
      assert.strictEqual(startStub.called, false);
    });

    it('should create and start a stream if mjpegScreenshotUrl is set', async function () {
      const driver = makeDriver({
        opts: {udid: 'device-1', mjpegScreenshotUrl: 'http://127.0.0.1:9100/mjpeg'} as any,
      });
      await handleMjpegOptions(driver);
      assert.ok(driver.mjpegStream instanceof MJpegStream);
      assert.strictEqual(startStub.calledOnce, true);
    });

    it('should allocate the MJPEG server port before starting the stream', async function () {
      const driver = makeDriver({
        opts: {udid: 'device-1', mjpegScreenshotUrl: 'http://127.0.0.1:9100/mjpeg'} as any,
      });
      await handleMjpegOptions(driver);
      assert.strictEqual(
        (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).calledBefore(startStub),
        true,
      );
    });
  });
});
