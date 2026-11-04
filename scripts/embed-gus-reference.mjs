import fs from "node:fs/promises";

/** Embed the original PNG byte-for-byte in a GLB produced by GLTFExporter. */
export async function embedReference(glb) {
  const input = Buffer.from(glb),
    jsonSize = input.readUInt32LE(12);
  const json = JSON.parse(input.subarray(20, 20 + jsonSize).toString());
  const binOffset = 20 + jsonSize,
    binLength = input.readUInt32LE(binOffset);
  const bin = input.subarray(binOffset + 8, binOffset + 8 + binLength);
  const png = await fs.readFile(
    "art/references/launch-2026-10-19/characters.png",
  );
  if (png.readUInt32BE(16) !== 1536 || png.readUInt32BE(20) !== 1024)
    throw new Error("Reference dimensions changed; UV landmarks need review");
  const offset = (bin.length + 3) & ~3,
    total = (offset + png.length + 3) & ~3;
  const outputBin = Buffer.alloc(total);
  bin.copy(outputBin);
  png.copy(outputBin, offset);
  json.bufferViews ??= [];
  json.images ??= [];
  json.samplers ??= [];
  json.textures ??= [];
  const view =
    json.bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: png.length,
    }) - 1;
  const image =
    json.images.push({
      bufferView: view,
      mimeType: "image/png",
      name: "Owner approved Gus lineup — unchanged source",
    }) - 1;
  const sampler =
    json.samplers.push({
      magFilter: 9729,
      minFilter: 9987,
      wrapS: 33071,
      wrapT: 33071,
    }) - 1;
  const texture = json.textures.push({ source: image, sampler }) - 1;
  let used = 0;
  for (const m of json.materials)
    if (m.name === "ReferenceGus") {
      m.pbrMetallicRoughness.baseColorTexture = { index: texture };
      used++;
    }
  if (!used) throw new Error("Reference material missing");
  json.buffers[0].byteLength = total;
  const raw = Buffer.from(JSON.stringify(json)),
    length = (raw.length + 3) & ~3;
  const out = Buffer.alloc(12 + 8 + length + 8 + total);
  out.writeUInt32LE(0x46546c67);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  out.fill(32, 20, 20 + length);
  raw.copy(out, 20);
  out.writeUInt32LE(total, 20 + length);
  out.writeUInt32LE(0x004e4942, 24 + length);
  outputBin.copy(out, 28 + length);
  return out;
}
