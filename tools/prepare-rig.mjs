// Turn a layered PSD into the bundle the phone draws.
// Layer splitting and rigging stay on the Mac. The app only renders and moves.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'ios', 'www');
const agPsd = require(path.join(www, 'lib', 'ag-psd.min.js'));
const Rigger = require(path.join(www, 'lib', 'rigger.js'));
const RT = require(path.join(www, 'lib', 'runtime.js'));
const GenericParts = require(path.join(www, 'lib', 'genericparts.js'));

agPsd.initializeCanvas(undefined, (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
}));

function usage() {
  console.error('用法: node tools/prepare-rig.mjs <分层.psd> [--out ios/www/prepared]');
  process.exit(2);
}

function pngRGBA(width, height, pixels) {
  const src = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    src.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(raw);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function readPsd(file) {
  const buf = fs.readFileSync(file);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  RT.validateHeader(bytes);
  const header = { useImageData: true, skipThumbnail: true, skipCompositeImageData: true };
  Rigger.validatePsd(agPsd.readPsd(new Uint8Array(bytes), { ...header, skipLayerImageData: true }));
  return agPsd.readPsd(new Uint8Array(bytes), { ...header, skipCompositeImageData: false });
}

function genericFromFiles() {
  const generic = {};
  for (const key of ['eyeL', 'eyeR', 'mouth']) {
    const part = GenericParts.get(key);
    if (part) generic[key] = part;
  }
  const eyeFile = path.join(www, 'eye_close.psd');
  const mouthFile = path.join(www, 'mouth_close.psd');
  if (fs.existsSync(eyeFile)) {
    const split = Rigger.splitImgLR(Rigger.flattenPsdToImg(readPsd(eyeFile)));
    if (split) {
      generic.eyeL = split.l;
      generic.eyeR = split.r;
    }
  }
  if (fs.existsSync(mouthFile)) {
    const mouth = Rigger.flattenPsdToImg(readPsd(mouthFile));
    if (mouth) generic.mouth = mouth;
  }
  return generic;
}

const args = process.argv.slice(2);
const image = args.find((arg) => !arg.startsWith('--'));
const outFlag = args.indexOf('--out');
const outDir = path.resolve(outFlag >= 0 ? args[outFlag + 1] : path.join(www, 'prepared'));
if (!image) usage();
const psdPath = path.resolve(image);
if (!fs.existsSync(psdPath)) {
  console.error('找不到图：' + psdPath);
  process.exit(1);
}

const source = fs.readFileSync(psdPath);
const id = RT.fingerprint(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
const psd = readPsd(psdPath);
const pre = Rigger.cleanPsdLayers(psd);
const rig = Rigger.buildRig(psd, { generic: genericFromFiles() });

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'layers'), { recursive: true });

const layers = rig.layers.map((layer, index) => {
  const file = 'layers/' + String(index).padStart(3, '0') + '.png';
  fs.writeFileSync(path.join(outDir, file), pngRGBA(layer.img.width, layer.img.height, layer.img.data));
  const copy = { ...layer, png: file };
  delete copy.img;
  return copy;
});

const prepared = {
  name: path.basename(psdPath),
  id,
  canvas: rig.canvas,
  anchors: rig.anchors,
  warnings: rig.warnings,
  synth: rig.synth,
  pre,
  layers,
};
fs.writeFileSync(path.join(outDir, 'rig.json'), JSON.stringify(prepared));
console.log(prepared.name + ' → ' + outDir);
console.log(layers.length + ' 层，' + rig.canvas.w + '×' + rig.canvas.h);
if (rig.warnings.length) console.log(rig.warnings.join('\n'));
