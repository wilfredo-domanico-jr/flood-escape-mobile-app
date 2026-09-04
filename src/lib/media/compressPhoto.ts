import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export const MAX_PHOTO_EDGE = 1280;
export const PHOTO_QUALITY = 0.7;

export type CompressedPhoto = { uri: string; width: number; height: number };

/**
 * Re-encodes a picked photo as a bounded JPEG. Re-encoding drops EXIF (GPS, device, time)
 * and keeps uploads under the 2 MB bucket limit.
 */
export async function compressPhoto(
  uri: string,
  size?: { width: number; height: number },
): Promise<CompressedPhoto> {
  const context = ImageManipulator.manipulate(uri);
  if (!size || Math.max(size.width, size.height) > MAX_PHOTO_EDGE) {
    if (size && size.height > size.width) context.resize({ height: MAX_PHOTO_EDGE });
    else context.resize({ width: MAX_PHOTO_EDGE });
  }
  const image = await context.renderAsync();
  try {
    const result = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
    return { uri: result.uri, width: result.width, height: result.height };
  } finally {
    image.release();
  }
}

const OUTBOX_DIR = "outbox";

/** Moves a compressed photo out of the cache so it survives until the outbox has sent it. */
export function stashPhotoForOutbox(uri: string, clientId: string): string {
  const dir = new Directory(Paths.document, OUTBOX_DIR);
  if (!dir.exists) dir.create();
  const target = new File(dir, `${clientId}.jpg`);
  const source = new File(uri);
  if (target.exists) target.delete();
  source.move(target);
  return target.uri;
}

export async function deleteStashedPhoto(uri: string): Promise<void> {
  const file = new File(uri);
  if (file.exists) file.delete();
}

export async function readPhotoBytes(uri: string): Promise<{ bytes: Uint8Array; size: number | null }> {
  const file = new File(uri);
  const bytes = await file.bytes();
  return { bytes, size: file.size ?? bytes.byteLength };
}
