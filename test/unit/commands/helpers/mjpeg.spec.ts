import http, {type Server} from 'node:http';
import {describe, it, before, beforeEach, afterEach} from 'node:test';

import {expect, use} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {createSandbox} from 'sinon';
import type sinon from 'sinon';
import sharp from 'sharp';

import type {XCUITestDriver} from '../../../../lib/driver.js';
import {
  allocateMjpegServerPort,
  handleMjpegOptions,
  MJpegStream,
} from '../../../../lib/commands/helpers/mjpeg.js';
import {UNIT_LONG_TIMEOUT_MS} from '../../helpers.js';

use(chaiAsPromised);

function buildMultipartFrame(jpeg: Buffer): Buffer {
  const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header), jpeg, Buffer.from('\r\n')]);
}

describe('mjpeg helpers', function () {
  describe('MJpegStream', function () {
    let jpeg: Buffer;
    let server: Server;
    let serverUrl: string;
    let framesToSend: number;
    let frameIntervalMs: number;
    let stream: MJpegStream | null;

    before(async function () {
      jpeg = await sharp({
        create: {width: 2, height: 2, channels: 3, background: {r: 255, g: 0, b: 0}},
      })
        .jpeg()
        .toBuffer();
    });

    beforeEach(async function () {
      framesToSend = 1;
      frameIntervalMs = 10;
      stream = null;
      server = http.createServer((_req, res) => {
        res.writeHead(200, {'Content-Type': 'multipart/x-mixed-replace; boundary=frame'});
        res.flushHeaders();
        let sent = 0;
        const timer = setInterval(() => {
          if (sent >= framesToSend) {
            clearInterval(timer);
            return;
          }
          res.write(buildMultipartFrame(jpeg));
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
      expect(stream.lastChunkBase64).to.be.null;
    });

    it('should capture the first JPEG frame once started', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
      stream = new MJpegStream(serverUrl);
      await stream.start();
      expect(stream.lastChunkBase64).to.equal(jpeg.toString('base64'));
    });

    it('should convert the last chunk to a PNG', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
      stream = new MJpegStream(serverUrl);
      await stream.start();
      const pngBase64 = await stream.lastChunkPNGBase64();
      expect(pngBase64).to.not.be.null;
      const png = Buffer.from(pngBase64 as string, 'base64');
      // PNG signature
      expect(png.subarray(0, 8).toString('hex')).to.equal('89504e470d0a1a0a');
    });

    it('should keep track of newer frames as they arrive', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
      framesToSend = 3;
      frameIntervalMs = 20;
      stream = new MJpegStream(serverUrl);
      await stream.start();
      await new Promise((resolve) => setTimeout(resolve, frameIntervalMs * framesToSend + 50));
      expect((stream as unknown as {updateCount: number}).updateCount).to.be.greaterThanOrEqual(2);
    });

    it('should clear the last chunk on stop()', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
      stream = new MJpegStream(serverUrl);
      await stream.start();
      expect(stream.lastChunkBase64).to.not.be.null;
      stream.stop();
      expect(stream.lastChunkBase64).to.be.null;
    });

    it('should reject if the server cannot be reached', async function () {
      stream = new MJpegStream('http://127.0.0.1:1');
      await expect(stream.start(200)).to.be.rejectedWith(/Cannot connect to the MJPEG stream/);
    });

    it('should reject if no frame arrives before the timeout', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
      framesToSend = 0;
      stream = new MJpegStream(serverUrl);
      // The server flushes headers immediately, so axios resolves well within the deadline;
      // the rejection comes from MJpegStream's own "no frame yet" guard.
      await expect(stream.start(300)).to.be.rejectedWith(/never sent any images/);
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
      expect(
        (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).calledWith('device-1', 9100, {
          devicePort: 9100,
          usePortForwarding: false,
          remoteXPCFacade: null,
        }),
      ).to.be.true;
    });

    it('should forward the requested port when mjpegServerPort is set', async function () {
      const driver = makeDriver({opts: {udid: 'device-1', mjpegServerPort: 9200} as any});
      await allocateMjpegServerPort(driver);
      expect(
        (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).calledWith('device-1', 9200, {
          devicePort: 9200,
          usePortForwarding: false,
          remoteXPCFacade: null,
        }),
      ).to.be.true;
    });

    it('should only warn if the default port cannot be forwarded', async function () {
      const driver = makeDriver();
      (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).rejects(new Error('port busy'));
      await allocateMjpegServerPort(driver);
      expect((driver.log.warn as sinon.SinonStub).calledWithMatch(/Certain features/)).to.be.true;
    });

    it('should throw if a custom mjpegServerPort cannot be forwarded', async function () {
      const driver = makeDriver({opts: {udid: 'device-1', mjpegServerPort: 9200} as any});
      (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).rejects(new Error('port busy'));
      await expect(allocateMjpegServerPort(driver)).to.be.rejectedWith(/mjpegServerPort.*port busy/);
    });

    it('should request a real-device connection with remoteXPCFacade when applicable', async function () {
      const remoteXPCFacade = {fake: true};
      const driver = makeDriver({
        isRealDevice: sandbox.stub().returns(true),
        remoteXPCFacade: remoteXPCFacade as any,
      });
      await allocateMjpegServerPort(driver);
      expect(
        (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).calledWith('device-1', 9100, {
          devicePort: 9100,
          usePortForwarding: true,
          remoteXPCFacade,
        }),
      ).to.be.true;
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
      expect(driver.mjpegStream).to.be.undefined;
      expect(startStub.called).to.be.false;
    });

    it('should create and start a stream if mjpegScreenshotUrl is set', async function () {
      const driver = makeDriver({
        opts: {udid: 'device-1', mjpegScreenshotUrl: 'http://127.0.0.1:9100/mjpeg'} as any,
      });
      await handleMjpegOptions(driver);
      expect(driver.mjpegStream).to.be.instanceOf(MJpegStream);
      expect(startStub.calledOnce).to.be.true;
    });

    it('should allocate the MJPEG server port before starting the stream', async function () {
      const driver = makeDriver({
        opts: {udid: 'device-1', mjpegScreenshotUrl: 'http://127.0.0.1:9100/mjpeg'} as any,
      });
      await handleMjpegOptions(driver);
      expect(
        (driver.deviceConnectionsFactory.requestConnection as sinon.SinonStub).calledBefore(startStub),
      ).to.be.true;
    });
  });
});
