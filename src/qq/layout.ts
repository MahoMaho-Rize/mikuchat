// LayoutCache — precomputed per-message heights for stable scroll positioning
//
// Each message's height (in terminal rows) is computed once at a reference
// width and cached. When the terminal resizes, text-line heights are linearly
// scaled while fixed-height elements (images, badges) stay constant.
//
// This prevents layout jumps from:
// - New messages arriving while browsing history
// - Images loading asynchronously
// - Terminal resize causing full reflow

import type { QCMessage, OB11Segment } from "./types";

// Fixed heights for non-text elements (rows)
const IMAGE_ROWS = 10;
const BADGE_ROWS = 1;

// Height breakdown for a single message
export interface MsgLayout {
  id: number; // message_id for dedup
  textChars: number; // total text characters (for linear rescale)
  fixedRows: number; // rows that don't change with width (border, image, badges)
  textRows: number; // text rows at reference width (changes with resize)
  total: number; // fixedRows + textRows = total height in rows
  sameSender: boolean; // collapsed header
}

export interface SessionLayout {
  ref: number; // reference content width (cols) used for computation
  msgs: MsgLayout[]; // ordered list, parallel to message array
  ids: Set<number>; // message_ids already in the layout (fast dedup)
  totalRows: number; // sum of all msg.total
}

// Compute content width: 85% of terminal width minus border+padding (4 cols)
function contentWidth(termWidth: number): number {
  return Math.max(10, Math.floor(termWidth * 0.85) - 4);
}

// Count text characters in segments
function countText(segments: OB11Segment[]): number {
  let n = 0;
  for (const seg of segments) {
    switch (seg.type) {
      case "text":
        n += seg.data.text.length;
        break;
      case "at":
        n += (seg.data.name || String(seg.data.qq)).length + 1;
        break;
      case "reply":
        n += 20;
        break; // approximate "↩ name: preview"
      case "mface":
        n += (seg.data.summary || "sticker").length + 2;
        break;
      case "face":
        n += 10;
        break;
      default:
        n += 12;
        break; // badges like [voice], [video], etc.
    }
  }
  return n;
}

// Count fixed-height rows from segments (images, etc.)
function countFixed(segments: OB11Segment[]): number {
  let rows = 0;
  for (const seg of segments) {
    if (seg.type === "image") rows += IMAGE_ROWS;
    if (seg.type === "video" || seg.type === "record" || seg.type === "file")
      rows += BADGE_ROWS;
  }
  return rows;
}

// Compute text rows for a given character count at a given content width
function textRows(chars: number, width: number): number {
  if (chars === 0) return 0;
  return Math.ceil(chars / width);
}

// Compute layout for a single message
function measure(
  msg: QCMessage,
  prev: QCMessage | undefined,
  width: number,
): MsgLayout {
  const same =
    !!prev && prev.user_id === msg.user_id && msg.time - prev.time < 120;

  const chars = countText(msg.segments);
  const fixed = countFixed(msg.segments);

  // Fixed rows: border (2) + header (0 or 1) + margin (0 or 1) + segment fixed
  const header = same ? 0 : 1;
  const margin = same ? 0 : 1;
  const border = 2;
  const fixedTotal = border + header + margin + fixed;

  const txt = textRows(chars, width);

  return {
    id: msg.message_id,
    textChars: chars,
    fixedRows: fixedTotal,
    textRows: txt,
    total: fixedTotal + txt,
    sameSender: same,
  };
}

// === Public API ===

const cache = new Map<string, SessionLayout>();

/** Get or create layout for a session */
export function getLayout(sessionId: string): SessionLayout {
  let layout = cache.get(sessionId);
  if (!layout) {
    layout = { ref: 80, msgs: [], ids: new Set(), totalRows: 0 };
    cache.set(sessionId, layout);
  }
  return layout;
}

/** Precompute layout for a batch of messages (idempotent — skips already-computed) */
export function precompute(
  sessionId: string,
  messages: QCMessage[],
  termWidth: number,
): SessionLayout {
  const layout = getLayout(sessionId);
  const width = contentWidth(termWidth);
  layout.ref = width;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (layout.ids.has(msg.message_id)) continue;
    const prev = i > 0 ? messages[i - 1] : undefined;
    const entry = measure(msg, prev, width);
    layout.msgs.push(entry);
    layout.ids.add(msg.message_id);
    layout.totalRows += entry.total;
  }

  return layout;
}

/** Append a single new message (incremental update) */
export function append(
  sessionId: string,
  msg: QCMessage,
  prev: QCMessage | undefined,
  termWidth: number,
): MsgLayout | null {
  const layout = getLayout(sessionId);
  if (layout.ids.has(msg.message_id)) return null;
  const width = contentWidth(termWidth);
  const entry = measure(msg, prev, width);
  layout.msgs.push(entry);
  layout.ids.add(msg.message_id);
  layout.totalRows += entry.total;
  return entry;
}

/** Rescale all text rows for a new terminal width (linear transform) */
export function rescale(sessionId: string, termWidth: number): void {
  const layout = cache.get(sessionId);
  if (!layout) return;
  const newWidth = contentWidth(termWidth);
  if (newWidth === layout.ref) return;

  let total = 0;
  for (const entry of layout.msgs) {
    entry.textRows = textRows(entry.textChars, newWidth);
    entry.total = entry.fixedRows + entry.textRows;
    total += entry.total;
  }
  layout.ref = newWidth;
  layout.totalRows = total;
}

/** Get the Y offset (in rows) of message at index `idx` */
export function offsetOf(sessionId: string, idx: number): number {
  const layout = cache.get(sessionId);
  if (!layout) return 0;
  let y = 0;
  for (let i = 0; i < idx && i < layout.msgs.length; i++) {
    y += layout.msgs[i].total;
  }
  return y;
}

/** Clear layout for a session */
export function clearLayout(sessionId: string): void {
  cache.delete(sessionId);
}

/** Clear all layouts */
export function clearAll(): void {
  cache.clear();
}
