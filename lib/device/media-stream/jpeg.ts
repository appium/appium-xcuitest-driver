/** Reads the dimensions from the first SOFn marker; null if not found. */
export function readJpegSize(buf: Buffer): {width: number; height: number} | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      return null;
    }
    const marker = buf[i + 1];
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7)};
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
