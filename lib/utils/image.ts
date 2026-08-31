import type sharp from 'sharp';
import type {Region} from 'sharp';

let sharpModule: typeof sharp | null = null;

/**
 * Lazily imports the optional `sharp` dependency.
 *
 * @returns The sharp module for image processing
 */
export async function requireSharp(): Promise<typeof sharp> {
  if (sharpModule) {
    return sharpModule;
  }
  try {
    sharpModule = (await import('sharp')).default;
    return sharpModule;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot load the 'sharp' module needed for image processing. ` +
        `Consider visiting https://sharp.pixelplumbing.com/install for troubleshooting. ` +
        `Original error: ${message}`,
      {cause: err},
    );
  }
}

/**
 * Crops the image by the given rectangle (base64 string in, base64 string out).
 *
 * @param base64Image The string with base64 encoded image.
 * Supports all image formats natively supported by Sharp library.
 * @param region The selected region of the image
 * @returns base64 encoded string of the cropped image
 */
export async function cropBase64Image(base64Image: string, region: Region): Promise<string> {
  const sharpInstance = await requireSharp();
  const buf = await sharpInstance(Buffer.from(base64Image, 'base64')).extract(region).toBuffer();
  return buf.toString('base64');
}
