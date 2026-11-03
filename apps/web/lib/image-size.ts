// Width and height from the first bytes of a JPEG, PNG or WebP, without an image library.
// Used to turn back photos too small for an installer to price from, and anything that isn't really a photo.
export type ImageInfo = { type: "jpeg" | "png" | "webp"; width: number; height: number };

export function imageInfo(buf: Uint8Array): ImageInfo | null {
  const u16 = (i: number) => (buf[i]! << 8) | buf[i + 1]!;
  const u32 = (i: number) => ((buf[i]! << 24) >>> 0) + (buf[i + 1]! << 16) + (buf[i + 2]! << 8) + buf[i + 3]!;
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { type: "png", width: u32(16), height: u32(20) };
  if (buf.length > 30 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    const chunk = String.fromCharCode(buf[12]!, buf[13]!, buf[14]!, buf[15]!);
    if (chunk === "VP8X") return { type: "webp", width: 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16)), height: 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16)) };
    if (chunk === "VP8 ") return { type: "webp", width: (buf[26]! | (buf[27]! << 8)) & 0x3fff, height: (buf[28]! | (buf[29]! << 8)) & 0x3fff };
    if (chunk === "VP8L") { const b = buf.subarray(21, 25); return { type: "webp", width: 1 + (((b[1]! & 0x3f) << 8) | b[0]!), height: 1 + (((b[3]! & 0xf) << 10) | (b[2]! << 2) | ((b[1]! & 0xc0) >> 6)) }; }
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1]!;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: "jpeg", height: u16(i + 5), width: u16(i + 7) };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + u16(i + 2);
    }
  }
  return null;
}

/** Longest side an installer needs to read a switchboard label. */
export const MIN_PHOTO_PX = 800;
