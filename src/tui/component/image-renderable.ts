// ImageRenderable - Kitty Graphics Protocol with Unicode Placeholders
//
// Uses buffer.drawText() to write U+10EEEE + diacritics into the text buffer.
// Unlike setCell (which only stores one codepoint and drops combining marks),
// drawText passes the full string to native Zig code which correctly handles
// grapheme clusters: base char + combining diacritics = one cell.
//
// The framework's scissor rect and buffer diff handle everything:
//   - Clipping: scrollbox viewport + overflow:hidden ancestors
//   - No ghosting: text buffer owns the cells, framework redraws on scroll
//   - No timing issues: placeholders are in the buffer, renderNative outputs them
//
// Kitty sees U+10EEEE with the image ID encoded in the foreground color and
// row/column diacritics, and renders the image at those cells automatically.
// Images scroll with text — no manual coordinate tracking needed.

import {
  Renderable,
  type RenderableOptions,
  OptimizedBuffer,
  RGBA,
} from "@opentui/core";

let nextImageId = 100;

const DIACRITICS = [
  0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f, 0x0346,
  0x034a, 0x034b, 0x034c, 0x0350, 0x0351, 0x0352, 0x0357, 0x035b, 0x0363,
  0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369, 0x036a, 0x036b, 0x036c,
  0x036d, 0x036e, 0x036f, 0x0483, 0x0484, 0x0485, 0x0486, 0x0487, 0x0592,
  0x0593, 0x0594, 0x0595, 0x0597, 0x0598, 0x0599, 0x059c, 0x059d, 0x059e,
  0x059f, 0x05a0, 0x05a1, 0x05a8, 0x05a9, 0x05ab, 0x05ac, 0x05af, 0x05c4,
  0x0610, 0x0611, 0x0612, 0x0613, 0x0614, 0x0615, 0x0616, 0x0617, 0x0657,
  0x0658, 0x0659, 0x065a, 0x065b, 0x065d, 0x065e, 0x06d6, 0x06d7, 0x06d8,
  0x06d9, 0x06da, 0x06db, 0x06dc, 0x06df, 0x06e0, 0x06e1, 0x06e2, 0x06e4,
  0x06e7, 0x06e8, 0x06eb, 0x06ec, 0x0730, 0x0732, 0x0733, 0x0735, 0x0736,
  0x073a, 0x073d, 0x073f, 0x0740, 0x0741, 0x0743, 0x0745, 0x0747, 0x0749,
  0x074a, 0x07eb, 0x07ec, 0x07ed, 0x07ee, 0x07ef, 0x07f0, 0x07f1, 0x07f3,
  0x0816, 0x0817, 0x0818, 0x0819, 0x081b, 0x081c, 0x081d, 0x081e, 0x081f,
  0x0820, 0x0821, 0x0822, 0x0823, 0x0825, 0x0826, 0x0827, 0x0829, 0x082a,
  0x082b, 0x082c, 0x082d, 0x0951, 0x0953, 0x0954, 0x0f82, 0x0f83, 0x0f86,
  0x0f87, 0x135d, 0x135e, 0x135f, 0x17dd, 0x193a, 0x1a17, 0x1a75, 0x1a76,
  0x1a77, 0x1a78, 0x1a79, 0x1a7a, 0x1a7b, 0x1a7c, 0x1b6b, 0x1b6d, 0x1b6e,
  0x1b6f, 0x1b70, 0x1b71, 0x1b72, 0x1b73, 0x1cd0, 0x1cd1, 0x1cd2, 0x1cda,
  0x1cdb, 0x1ce0, 0x1dc0, 0x1dc1, 0x1dc3, 0x1dc4, 0x1dc5, 0x1dc6, 0x1dc7,
  0x1dc8, 0x1dc9, 0x1dcb, 0x1dcc, 0x1dd1, 0x1dd2, 0x1dd3, 0x1dd4, 0x1dd5,
  0x1dd6, 0x1dd7, 0x1dd8, 0x1dd9, 0x1dda, 0x1ddb, 0x1ddc, 0x1ddd, 0x1dde,
  0x1ddf, 0x1de0, 0x1de1, 0x1de2, 0x1de3, 0x1de4, 0x1de5, 0x1de6, 0x1dfe,
  0x20d0, 0x20d1, 0x20d4, 0x20d5, 0x20d6, 0x20d7, 0x20db, 0x20dc, 0x20e1,
  0x20e7, 0x20e9, 0x20f0, 0x2cef, 0x2cf0, 0x2cf1, 0x2de0, 0x2de1, 0x2de2,
  0x2de3, 0x2de4, 0x2de5, 0x2de6, 0x2de7, 0x2de8, 0x2de9, 0x2dea, 0x2deb,
  0x2dec, 0x2ded, 0x2dee, 0x2def, 0x2df0, 0x2df1, 0x2df2, 0x2df3, 0x2df4,
  0x2df5, 0x2df6, 0x2df7, 0x2df8, 0x2df9, 0x2dfa, 0x2dfb, 0x2dfc, 0x2dfd,
  0x2dfe, 0x2dff, 0xa66f, 0xa67c, 0xa67d, 0xa6f0, 0xa6f1, 0xa8e0, 0xa8e1,
  0xa8e2, 0xa8e3, 0xa8e4, 0xa8e5,
];

const PLACEHOLDER = String.fromCodePoint(0x10eeee);

function diacritic(n: number): string {
  if (n < 0 || n >= DIACRITICS.length) return "";
  return String.fromCodePoint(DIACRITICS[n]);
}

function writeStdout(data: string) {
  try {
    const fs = require("fs") as typeof import("fs");
    fs.writeSync(1, data);
  } catch {
    try {
      process.stdout.write(data);
    } catch {}
  }
}
// writeSync is an alias kept for the remaining callers
function writeSync(data: string) {
  writeStdout(data);
}

// === Pool ===
interface PoolEntry {
  pngB64: string;
  cols: number;
  rows: number;
  kittyId: number;
  transmitted: boolean;
  virtual: boolean;
  refCount: number;
}

const pool = new Map<string, PoolEntry>();
const pending = new Map<string, Promise<PoolEntry | null>>();

function contentHash(buf: Buffer): string {
  return Bun.hash(buf).toString(16);
}

async function acquireFromPool(
  rawBytes: Buffer,
  maxCols: number,
  maxRows: number,
): Promise<PoolEntry | null> {
  const hash = contentHash(rawBytes) + `|${maxCols}x${maxRows}`;
  const existing = pool.get(hash);
  if (existing) {
    existing.refCount++;
    return existing;
  }
  const running = pending.get(hash);
  if (running) {
    const r = await running;
    if (r) r.refCount++;
    return r;
  }

  const promise = (async (): Promise<PoolEntry | null> => {
    try {
      const sharp = require("sharp");
      const { data, info } = await sharp(rawBytes)
        .resize({
          width: maxCols * 8,
          height: maxRows * 16,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer({ resolveWithObject: true });
      const entry: PoolEntry = {
        pngB64: data.toString("base64"),
        cols: Math.ceil(info.width / 8),
        rows: Math.ceil(info.height / 16),
        kittyId: ++nextImageId,
        transmitted: false,
        virtual: false,
        refCount: 1,
      };
      pool.set(hash, entry);
      return entry;
    } catch {
      return null;
    } finally {
      pending.delete(hash);
    }
  })();
  pending.set(hash, promise);
  return promise;
}

function releaseFromPool(hash: string) {
  const entry = pool.get(hash);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    if (entry.transmitted)
      writeSync(`\x1b_Ga=d,d=I,i=${entry.kittyId},q=2\x1b\\`);
    pool.delete(hash);
  }
}

function ensureTransmitted(entry: PoolEntry) {
  if (entry.transmitted) return;
  const b64 = entry.pngB64;
  const id = entry.kittyId;
  const out: string[] = [];
  if (b64.length <= 4096) {
    out.push(`\x1b_Ga=t,f=100,i=${id},q=2;${b64}\x1b\\`);
  } else {
    for (let i = 0; i < b64.length; i += 4096) {
      const chunk = b64.slice(i, i + 4096);
      const m = i + 4096 >= b64.length ? 0 : 1;
      out.push(
        i === 0
          ? `\x1b_Ga=t,f=100,i=${id},m=${m},q=2;${chunk}\x1b\\`
          : `\x1b_Gm=${m},q=2;${chunk}\x1b\\`,
      );
    }
  }
  writeStdout(out.join(""));
  entry.transmitted = true;
}

function ensureVirtual(entry: PoolEntry) {
  if (entry.virtual) return;
  writeSync(
    `\x1b_Ga=p,U=1,i=${entry.kittyId},c=${entry.cols},r=${entry.rows},q=2\x1b\\`,
  );
  entry.virtual = true;
}

// === ImageRenderable ===

export interface ImageRenderableOptions
  extends RenderableOptions<ImageRenderable> {
  src?: string;
  maxCols?: number;
  maxRows?: number;
}

export class ImageRenderable extends Renderable {
  private _src?: string;
  private _maxCols: number;
  private _maxRows: number;
  private _poolHash = "";
  private _entry: PoolEntry | null = null;
  private _loaded = false;
  private _fg: RGBA | null = null;

  constructor(ctx: any, options: ImageRenderableOptions) {
    super(ctx, {
      ...options,
      width: options.maxCols ?? 40,
      height: 1,
    });
    this._src = options.src;
    this._maxCols = options.maxCols ?? 40;
    this._maxRows = options.maxRows ?? 10;
    if (options.src) this.loadImage(options.src);
  }

  set src(value: string | undefined) {
    if (value === this._src) return;
    this.cleanup();
    this._src = value;
    if (value) this.loadImage(value);
  }

  set maxCols(value: number) {
    if (value === this._maxCols) return;
    const old = this._maxCols;
    this._maxCols = value;
    if (this._src && Math.abs(value - old) > old * 0.1) {
      this.cleanup();
      this.loadImage(this._src);
    }
  }

  set maxRows(value: number) {
    if (value === this._maxRows) return;
    const old = this._maxRows;
    this._maxRows = value;
    if (this._src && Math.abs(value - old) > old * 0.1) {
      this.cleanup();
      this.loadImage(this._src);
    }
  }

  private async loadImage(src: string) {
    try {
      let buf: Buffer;
      if (src.startsWith("http://") || src.startsWith("https://")) {
        const resp = await fetch(src);
        if (!resp.ok) return;
        buf = Buffer.from(await resp.arrayBuffer());
      } else {
        buf = Buffer.from(await Bun.file(src).arrayBuffer());
      }
      this._poolHash = contentHash(buf) + `|${this._maxCols}x${this._maxRows}`;
      const entry = await acquireFromPool(buf, this._maxCols, this._maxRows);
      if (!entry) return;
      this._entry = entry;

      // Transmit image data + create virtual placement immediately on load,
      // NOT in renderSelf where stdout writes would interleave with renderNative.
      ensureTransmitted(entry);
      ensureVirtual(entry);

      this._loaded = true;

      // Encode image ID as 24-bit truecolor foreground
      const id = entry.kittyId;
      this._fg = RGBA.fromInts(
        (id >> 16) & 0xff,
        (id >> 8) & 0xff,
        id & 0xff,
        255,
      );

      const node = this.getLayoutNode();
      node.setWidth(entry.cols);
      node.setHeight(entry.rows);
    } catch {}
  }

  // Write Unicode placeholder characters into the text buffer using drawText.
  // drawText passes the full string (including combining diacritics) to the
  // native Zig renderer which correctly handles grapheme clusters.
  // The framework's scissor rect clips to scrollbox + overflow:hidden ancestors.
  // No manual coordinate tracking, no setTimeout, no ghosting.
  protected renderSelf(buffer: OptimizedBuffer): void {
    if (!this._loaded || !this._entry || !this._fg) return;

    const entry = this._entry;
    const fg = this._fg;
    for (let row = 0; row < entry.rows; row++) {
      // Build the row string: first cell has row diacritic, rest are bare.
      // Each placeholder is one cell wide. Kitty inherits column from left.
      let line = "";
      for (let col = 0; col < entry.cols; col++) {
        line += col === 0 ? PLACEHOLDER + diacritic(row) : PLACEHOLDER;
      }
      // Pass null bg so native layer inherits parent background.
      // RGBA with alpha=0 causes the renderer to skip these cells.
      (buffer as any).drawText(line, 0, row, fg, null);
    }
  }

  render(buffer: OptimizedBuffer, deltaTime: number): void {
    super.render(buffer, deltaTime);
  }

  private cleanup() {
    if (this._poolHash) releaseFromPool(this._poolHash);
    this._entry = null;
    this._loaded = false;
    this._poolHash = "";
    this._fg = null;
  }

  protected destroySelf(): void {
    this.cleanup();
  }
}
