// ImageRenderable - Kitty Graphics Protocol with viewport clipping + content-hash cache pool
//
// Cache architecture:
// 1. Download cache: src URL → raw bytes (in QQImage component, disk level)
// 2. PNG pool: contentHash → { pngB64, pxW, pxH, cols, rows, kittyId, transmitted }
//    - Keyed by content hash, not URL
//    - Same image content from different URLs shares one pool entry
//    - PNG conversion + base64 encoding done once per unique image
//    - Kitty transmission done once per unique image (a=t stores in terminal memory)
//    - Placement (a=p) is per-renderable (position-dependent)
// 3. Frame dedup: _lastRect prevents redundant placement writes

import {
  Renderable,
  type RenderableOptions,
  OptimizedBuffer,
} from "@opentui/core";

let nextImageId = 100;

// Async stdout writer — avoids blocking the event loop with large payloads
// Uses process.stdout.write which is buffered and non-blocking
function writeStdout(data: string) {
  try {
    process.stdout.write(data);
  } catch {}
}

// === Content-hash PNG pool ===
interface PoolEntry {
  pngB64: string;
  pxW: number;
  pxH: number;
  cols: number;
  rows: number;
  kittyId: number;
  transmitted: boolean;
  refCount: number;
}

const pool = new Map<string, PoolEntry>();
const pendingConversions = new Map<string, Promise<PoolEntry | null>>();

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

  const pending = pendingConversions.get(hash);
  if (pending) {
    const result = await pending;
    if (result) result.refCount++;
    return result;
  }

  const promise = (async (): Promise<PoolEntry | null> => {
    try {
      const sharp = require("sharp");
      const maxPxW = maxCols * 8;
      const maxPxH = maxRows * 16;

      const { data, info } = await sharp(rawBytes)
        .resize({
          width: maxPxW,
          height: maxPxH,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer({ resolveWithObject: true });

      const entry: PoolEntry = {
        pngB64: data.toString("base64"),
        pxW: info.width,
        pxH: info.height,
        cols: Math.ceil(info.width / 8),
        rows: Math.ceil(info.height / 16),
        kittyId: ++nextImageId,
        transmitted: false,
        refCount: 1,
      };

      pool.set(hash, entry);
      return entry;
    } catch {
      return null;
    } finally {
      pendingConversions.delete(hash);
    }
  })();

  pendingConversions.set(hash, promise);
  return promise;
}

function releaseFromPool(hash: string) {
  const entry = pool.get(hash);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    // Evict from pool + delete from terminal memory
    if (entry.transmitted) {
      writeStdout(`\x1b_Ga=d,d=I,i=${entry.kittyId},q=2\x1b\\`);
    }
    pool.delete(hash);
  }
}

function transmitEntry(entry: PoolEntry) {
  if (entry.transmitted) return;

  const b64 = entry.pngB64;
  const id = entry.kittyId;
  const out: string[] = [];

  if (b64.length <= 4096) {
    out.push(`\x1b_Ga=t,f=100,i=${id},q=2;${b64}\x1b\\`);
  } else {
    const chunkSize = 4096;
    for (let i = 0; i < b64.length; i += chunkSize) {
      const chunk = b64.slice(i, i + chunkSize);
      const last = i + chunkSize >= b64.length;
      const m = last ? 0 : 1;
      if (i === 0) {
        out.push(`\x1b_Ga=t,f=100,i=${id},m=${m},q=2;${chunk}\x1b\\`);
      } else {
        out.push(`\x1b_Gm=${m},q=2;${chunk}\x1b\\`);
      }
    }
  }

  writeStdout(out.join(""));
  entry.transmitted = true;
}

// === ImageRenderable ===

export interface ImageRenderableOptions
  extends RenderableOptions<ImageRenderable> {
  src?: string;
  maxCols?: number;
  maxRows?: number;
}

interface VisibleRect {
  screenX: number;
  screenY: number;
  srcX: number;
  srcY: number;
  cols: number;
  rows: number;
}

export class ImageRenderable extends Renderable {
  private _src?: string;
  private _maxCols: number;
  private _maxRows: number;
  private _poolHash = "";
  private _entry: PoolEntry | null = null;
  private _loaded = false;
  private _placed = false;
  private _lastRect = "";

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
    // Only reload if change is significant (>10%) to avoid constant re-conversion
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
      this._loaded = true;

      const node = this.getLayoutNode();
      node.setWidth(entry.cols);
      node.setHeight(entry.rows);
    } catch {}
  }

  private deletePlacement() {
    if (this._placed && this._entry) {
      writeStdout(`\x1b_Ga=d,d=i,i=${this._entry.kittyId},q=2\x1b\\\n`);
      this._placed = false;
      this._lastRect = "";
    }
  }

  private getViewport(): { top: number; bottom: number } {
    let top = 0;
    let bottom = 9999;
    let node: Renderable | null = this.parent as Renderable | null;
    while (node) {
      top = Math.max(top, node.y);
      bottom = Math.min(bottom, node.y + node.height);
      node = node.parent as Renderable | null;
    }
    return { top, bottom };
  }

  private computeVisibleRect(): VisibleRect | null {
    if (!this._entry) return null;
    const absX = this.x;
    const absY = this.y;
    const rows = this._entry.rows;
    const cols = this._entry.cols;
    const { top, bottom } = this.getViewport();

    if (absY + rows <= top || absY >= bottom) return null;

    const clippedTop = Math.max(0, top - absY);
    const clippedBottom = Math.max(0, absY + rows - bottom);
    const visibleRows = rows - clippedTop - clippedBottom;

    if (visibleRows <= 0) return null;

    return {
      screenX: absX,
      screenY: absY + clippedTop,
      srcX: 0,
      srcY: clippedTop * 16,
      cols,
      rows: visibleRows,
    };
  }

  private placeImage(rect: VisibleRect) {
    if (!this._entry) return;
    const id = this._entry.kittyId;
    const srcW = rect.cols * 8;
    const srcH = rect.rows * 16;

    const seq =
      `\x1b[${rect.screenY + 1};${rect.screenX + 1}H` +
      `\x1b_Ga=p,i=${id},x=${rect.srcX},y=${rect.srcY},w=${srcW},h=${srcH},c=${rect.cols},r=${rect.rows},C=1,q=2\x1b\\`;

    writeStdout(seq);
    this._placed = true;
  }

  protected renderSelf(_buffer: OptimizedBuffer): void {}

  render(buffer: OptimizedBuffer, deltaTime: number): void {
    super.render(buffer, deltaTime);
    if (!this._loaded || !this._entry) return;

    // Transmit to terminal memory once (shared across all renderables with same content)
    transmitEntry(this._entry);

    const rect = this.computeVisibleRect();
    const rectKey = rect
      ? `${rect.screenX},${rect.screenY},${rect.rows},${rect.srcY}`
      : "hidden";

    if (rectKey === this._lastRect) return;

    this.deletePlacement();
    if (rect) this.placeImage(rect);
    this._lastRect = rectKey;
  }

  protected onResize(): void {
    this.deletePlacement();
    this._lastRect = "";
  }

  private cleanup() {
    this.deletePlacement();
    if (this._poolHash) releaseFromPool(this._poolHash);
    this._entry = null;
    this._loaded = false;
    this._poolHash = "";
    this._lastRect = "";
  }

  protected destroySelf(): void {
    this.cleanup();
  }
}
