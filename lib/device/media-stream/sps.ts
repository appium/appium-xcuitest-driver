export interface VideoSize {
  width: number;
  height: number;
}

class BitReader {
  private pos = 0;

  constructor(private readonly data: Buffer) {}

  bit(): number {
    const byte = this.data[this.pos >> 3];
    if (byte === undefined) {
      throw new RangeError('Unexpected end of the SPS');
    }
    return (byte >> (7 - (this.pos++ & 7))) & 1;
  }

  bits(n: number): number {
    let value = 0;
    for (let i = 0; i < n; i++) {
      value = value * 2 + this.bit();
    }
    return value;
  }

  skip(n: number): void {
    this.pos += n;
  }

  ue(): number {
    let zeros = 0;
    while (this.bit() === 0) {
      if (++zeros > 31) {
        throw new RangeError('Invalid Exp-Golomb code in the SPS');
      }
    }
    return 2 ** zeros - 1 + this.bits(zeros);
  }

  se(): number {
    const k = this.ue();
    return k % 2 ? (k + 1) / 2 : -k / 2;
  }
}

/** Splits an Annex-B buffer into NAL units (without start codes). */
export function splitNalUnits(data: Buffer): Buffer[] {
  const starts: number[] = [];
  for (let i = 0; i + 2 < data.length; i++) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      starts.push(i + 3);
      i += 2;
    }
  }
  return starts.map((start, idx) => {
    let end = idx + 1 < starts.length ? starts[idx + 1] - 3 : data.length;
    // A 4-byte start code leaves one trailing zero on the previous unit
    while (end > start && data[end - 1] === 0) {
      end--;
    }
    return data.subarray(start, end);
  });
}

// RBSP: drops the emulation prevention bytes (00 00 03 -> 00 00)
function unescape(nal: Buffer): Buffer {
  const out: number[] = [];
  let zeros = 0;
  for (const byte of nal) {
    if (zeros >= 2 && byte === 3) {
      zeros = 0;
      continue;
    }
    zeros = byte === 0 ? zeros + 1 : 0;
    out.push(byte);
  }
  return Buffer.from(out);
}

const H264_SPS = 7;
const HEVC_SPS = 33;
const H264_HIGH_PROFILES = new Set([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]);

function skipH264ScalingList(r: BitReader, size: number): void {
  let last = 8;
  let next = 8;
  for (let j = 0; j < size; j++) {
    if (next !== 0) {
      next = (last + r.se() + 256) % 256;
    }
    last = next === 0 ? last : next;
  }
}

function parseH264Sps(rbsp: Buffer): VideoSize {
  const r = new BitReader(rbsp);
  r.skip(8); // NAL header
  const profile = r.bits(8);
  r.skip(16); // constraint flags + level
  r.ue(); // sps id
  let chroma = 1;
  if (H264_HIGH_PROFILES.has(profile)) {
    chroma = r.ue();
    if (chroma === 3) {
      r.skip(1);
    }
    r.ue();
    r.ue();
    r.skip(1);
    if (r.bit()) {
      for (let i = 0; i < (chroma !== 3 ? 8 : 12); i++) {
        if (r.bit()) {
          skipH264ScalingList(r, i < 6 ? 16 : 64);
        }
      }
    }
  }
  r.ue(); // log2_max_frame_num_minus4
  const pocType = r.ue();
  if (pocType === 0) {
    r.ue();
  } else if (pocType === 1) {
    r.skip(1);
    r.se();
    r.se();
    for (let i = r.ue(); i > 0; i--) {
      r.se();
    }
  }
  r.ue(); // max_num_ref_frames
  r.skip(1);
  const widthMbs = r.ue() + 1;
  const heightMapUnits = r.ue() + 1;
  const frameMbsOnly = r.bit();
  if (!frameMbsOnly) {
    r.skip(1);
  }
  r.skip(1); // direct_8x8_inference
  let crop = [0, 0, 0, 0];
  if (r.bit()) {
    crop = [r.ue(), r.ue(), r.ue(), r.ue()];
  }
  const cropX = chroma === 0 || chroma === 3 ? 1 : 2;
  const cropY = (chroma === 1 ? 2 : 1) * (2 - frameMbsOnly);
  return {
    width: widthMbs * 16 - cropX * (crop[0] + crop[1]),
    height: (2 - frameMbsOnly) * heightMapUnits * 16 - cropY * (crop[2] + crop[3]),
  };
}

function parseHevcSps(rbsp: Buffer): VideoSize {
  const r = new BitReader(rbsp);
  r.skip(16); // NAL header
  r.skip(4); // vps id
  const maxSubLayersMinus1 = r.bits(3);
  r.skip(1);
  r.skip(96); // general profile_tier_level
  const profilePresent: number[] = [];
  const levelPresent: number[] = [];
  for (let i = 0; i < maxSubLayersMinus1; i++) {
    profilePresent.push(r.bit());
    levelPresent.push(r.bit());
  }
  if (maxSubLayersMinus1 > 0) {
    r.skip(2 * (8 - maxSubLayersMinus1));
  }
  for (let i = 0; i < maxSubLayersMinus1; i++) {
    r.skip(profilePresent[i] * 88 + levelPresent[i] * 8);
  }
  r.ue(); // sps id
  const chroma = r.ue();
  if (chroma === 3) {
    r.skip(1);
  }
  const width = r.ue();
  const height = r.ue();
  let crop = [0, 0, 0, 0];
  if (r.bit()) {
    crop = [r.ue(), r.ue(), r.ue(), r.ue()];
  }
  const subWidth = chroma === 1 || chroma === 2 ? 2 : 1;
  const subHeight = chroma === 1 ? 2 : 1;
  return {
    width: width - subWidth * (crop[0] + crop[1]),
    height: height - subHeight * (crop[2] + crop[3]),
  };
}

/**
 * Reads the frame size from the SPS in a video config unit (Annex-B).
 * Returns null if there is no SPS or it cannot be parsed.
 */
export function parseVideoSize(config: Buffer, codec: 'h264' | 'hevc'): VideoSize | null {
  try {
    for (const nal of splitNalUnits(config)) {
      if (codec === 'h264' && (nal[0] & 0x1f) === H264_SPS) {
        return parseH264Sps(unescape(nal));
      }
      if (codec === 'hevc' && ((nal[0] >> 1) & 0x3f) === HEVC_SPS) {
        return parseHevcSps(unescape(nal));
      }
    }
  } catch {
    // Not decodable here; the stream itself is unaffected
  }
  return null;
}
