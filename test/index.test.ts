import { describe, it, expect, beforeAll } from "bun:test";
import inflate from "../index.ts";
import * as zlib from "node:zlib";
import * as fs from "node:fs";
import * as path from "node:path";

const uncompressed = fs.readFileSync(path.join(import.meta.dir, "lorem.txt"));

describe("tiny-inflate", () => {
  let compressed: Buffer;
  let noCompression: Buffer;
  let fixed: Buffer;

  function deflate(buf: Buffer, options: zlib.ZlibOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.deflateRaw(buf, options, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  beforeAll(async () => {
    compressed = await deflate(uncompressed, {});
    noCompression = await deflate(uncompressed, { level: zlib.constants.Z_NO_COMPRESSION });
    fixed = await deflate(uncompressed, { strategy: zlib.constants.Z_FIXED });
  });

  it("should inflate some data", () => {
    const out = Buffer.alloc(uncompressed.length);
    inflate(compressed, out);
    expect(out).toEqual(uncompressed);
  });

  it("should slice output buffer", () => {
    const out = Buffer.alloc(uncompressed.length + 1024);
    const res = inflate(compressed, out);
    expect(Buffer.from(res)).toEqual(uncompressed);
    expect(res.length).toBe(uncompressed.length);
  });

  it("should handle uncompressed blocks", () => {
    const out = Buffer.alloc(uncompressed.length);
    inflate(noCompression, out);
    expect(out).toEqual(uncompressed);
  });

  it("should handle fixed huffman blocks", () => {
    const out = Buffer.alloc(uncompressed.length);
    inflate(fixed, out);
    expect(out).toEqual(uncompressed);
  });

  it("should handle typed arrays", () => {
    const input = new Uint8Array(compressed);
    const out = new Uint8Array(uncompressed.length);
    inflate(input, out);
    expect(out).toEqual(new Uint8Array(uncompressed));
  });
});
