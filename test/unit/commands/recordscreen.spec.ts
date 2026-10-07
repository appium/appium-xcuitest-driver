import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import http from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';

import {logger} from 'appium/support.js';
import sharp from 'sharp';

import {ScreenRecorder} from '../../../lib/commands/recordscreen.js';

const run = promisify(execFile);

describe('screen recording with changing frame geometry', () => {
  for (const [videoType, changeGeometry, rawStream] of [
    ['mjpeg', true],
    ['libx264', true],
    ['mjpeg', false],
    ['mjpeg', false, true],
  ] as const) {
    it(
      `should preserve circle proportions and 10 fps with ${videoType} (resize: ${changeGeometry}, raw: ${!!rawStream})`,
      {timeout: 45000},
      async (t) => {
        try {
          await run('ffmpeg', ['-version']);
          await run('ffprobe', ['-version']);
        } catch {
          t.skip('Requires ffmpeg and ffprobe');
          return;
        }
        const frame = async (width: number, height: number) =>
          await sharp(
            Buffer.from(
              `<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/>` +
                `<circle cx="${width / 2}" cy="${height / 2}" r="40" fill="white"/></svg>`,
            ),
          )
            .jpeg()
            .toBuffer();
        const frames = [await frame(200, 300), await frame(400, 200)];
        let index = 0;
        const server = http.createServer((_req, res) => {
          res.writeHead(200, {
            'Content-Type': rawStream ? 'video/x-motion-jpeg' : 'multipart/x-mixed-replace; boundary=frame',
          });
          const timer = setInterval(() => {
            const jpeg = frames[index];
            if (!rawStream) {
              res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
            }
            res.write(jpeg);
            if (!rawStream) {
              res.write('\r\n');
            }
          }, 100);
          res.on('close', () => clearInterval(timer));
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        const dir = await mkdtemp(path.join(tmpdir(), 'recordscreen-test-'));
        const videoPath = path.join(dir, 'capture.mp4');
        const recorder = new ScreenRecorder('test', logger.getLogger('RecordingTest'), videoPath, {
          remoteUrl: 'http://127.0.0.1',
          remotePort: address.port,
          videoType,
          videoFps: 10,
        });
        try {
          await recorder.start(30000);
          await delay(500);
          index = changeGeometry ? 1 : 0;
          await delay(1500);
          await recorder.interrupt();
          const {stdout} = await run('ffprobe', [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=width,height,avg_frame_rate,nb_frames,duration',
            '-of',
            'json',
            videoPath,
          ]);
          const stream = JSON.parse(stdout).streams[0];
          assert.equal(stream.width, 200);
          assert.equal(stream.height, 300);
          assert.equal(stream.avg_frame_rate, '10/1');
          assert.ok(Number(stream.nb_frames) > 10);
          assert.ok(Math.abs(Number(stream.duration) - Number(stream.nb_frames) / 10) < 0.01);
          const png = path.join(dir, 'last.png');
          await run('ffmpeg', ['-v', 'error', '-sseof', '-0.1', '-i', videoPath, '-frames:v', '1', png]);
          const {data, info} = await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject: true});
          let minX = info.width,
            minY = info.height,
            maxX = -1,
            maxY = -1;
          for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
              if (data[(y * info.width + x) * info.channels] > 200) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
              }
            }
          }
          assert.ok(maxX > minX && maxY > minY);
          assert.ok(
            Math.abs((maxX - minX + 1) / (maxY - minY + 1) - 1) < 0.1,
            'The circle must remain round after changing the input aspect ratio',
          );
        } finally {
          await recorder.interrupt(true);
          server.closeAllConnections();
          await new Promise<void>((resolve) => server.close(() => resolve()));
          await rm(dir, {recursive: true, force: true});
        }
      },
    );
  }
});
