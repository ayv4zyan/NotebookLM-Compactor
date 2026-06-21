/**
 * Minimal ZIP writer (stored entries only) — no eval/Function constructor.
 * Stored method 0 avoids vendored DEFLATE (AMO lint / auditability).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    const target =
      typeof window !== "undefined"
        ? window
        : typeof globalThis !== "undefined"
          ? globalThis
          : root;
    target.NBLC = target.NBLC || {};
    target.NBLC.zipBlob = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const encoder = new TextEncoder();
  const UTF8_GPBF = 0x0800;

  const ENCODE_CHAR_CHUNK = 64 * 1024;
  const CRC_CHUNK_BYTES = 64 * 1024;
  const BLOB_FAN_IN = 32;

  function nameNeedsUtf8Flag(name) {
    for (let i = 0; i < name.length; i++) {
      if (name.charCodeAt(i) > 127) return true;
    }
    return false;
  }

  function sanitizeUtf16(str) {
    let out = "";
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          out += str[i] + str[i + 1];
          i++;
        } else {
          out += "\uFFFD";
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        out += "\uFFFD";
      } else {
        out += str[i];
      }
    }
    return out;
  }

  const CRC32_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    CRC32_TABLE[i] = value;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const year = date.getFullYear();
    const time =
      ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) &
      0xffff;
    const day =
      (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
    return { time, date: day };
  }

  async function yieldToMain() {
    if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") {
      await scheduler.yield();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function crc32Chunked(bytes) {
    if (bytes.length <= CRC_CHUNK_BYTES) {
      return crc32(bytes);
    }

    let crc = 0xffffffff;
    for (let offset = 0; offset < bytes.length; offset += CRC_CHUNK_BYTES) {
      const slice = bytes.subarray(offset, Math.min(offset + CRC_CHUNK_BYTES, bytes.length));
      for (let i = 0; i < slice.length; i++) {
        crc = CRC32_TABLE[(crc ^ slice[i]) & 0xff] ^ (crc >>> 8);
      }
      await yieldToMain();
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function encodeUtf8Chunked(str) {
    const safe = sanitizeUtf16(str);
    if (safe.length <= ENCODE_CHAR_CHUNK) {
      await yieldToMain();
      return encoder.encode(safe);
    }

    const parts = [];
    let totalLen = 0;
    for (let i = 0; i < safe.length; i += ENCODE_CHAR_CHUNK) {
      const slice = safe.slice(i, Math.min(i + ENCODE_CHAR_CHUNK, safe.length));
      const encoded = encoder.encode(slice);
      parts.push(encoded);
      totalLen += encoded.length;
      await yieldToMain();
    }

    if (parts.length === 1) {
      return parts[0];
    }

    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  function nestBlobParts(parts) {
    if (parts.length === 0) {
      return new Blob([], { type: "application/zip" });
    }

    let level = parts.slice();
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += BLOB_FAN_IN) {
        const slice = level.slice(i, i + BLOB_FAN_IN);
        next.push(slice.length === 1 ? slice[0] : new Blob(slice, { type: "application/zip" }));
      }
      level = next;
    }

    const result = level[0];
    return result instanceof Blob ? result : new Blob([result], { type: "application/zip" });
  }

  async function createZipBlob(files) {
    if (!files || typeof files !== "object") {
      throw new TypeError("createZipBlob expects a plain object of filename → content");
    }

    const entries = Object.entries(files);
    const chunks = [];
    const central = [];
    let offset = 0;
    const { time, date } = dosDateTime(new Date());

    for (const [name, content] of entries) {
      const nameStr = String(name);
      const contentStr = content == null ? "" : String(content);

      const nameBytes = await encodeUtf8Chunked(nameStr);
      const dataBytes = await encodeUtf8Chunked(contentStr);
      const checksum = await crc32Chunked(dataBytes);
      const size = dataBytes.length;
      const gpbf = nameNeedsUtf8Flag(nameStr) ? UTF8_GPBF : 0;

      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, gpbf, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, time, true);
      localView.setUint16(12, date, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, size, true);
      localView.setUint32(22, size, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      chunks.push(local, dataBytes);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, gpbf, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, time, true);
      centralView.setUint16(14, date, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, size, true);
      centralView.setUint32(24, size, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      central.push(centralHeader);

      offset += local.length + dataBytes.length;
      await yieldToMain();
    }

    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    return nestBlobParts(chunks.concat(central, [end]));
  }

  return { createZipBlob, sanitizeUtf16 };
});