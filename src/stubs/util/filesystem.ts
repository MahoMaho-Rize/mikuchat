import fs from "fs/promises"
import path from "path"
import { existsSync, mkdirSync, readFileSync } from "fs"

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/typescript",
}

export const Filesystem = {
  exists: async (p: string) => {
    try {
      await fs.access(p)
      return true
    } catch {
      return false
    }
  },
  read: async (p: string) => fs.readFile(p, "utf-8"),
  readText: async (p: string) => fs.readFile(p, "utf-8"),
  readBytes: async (p: string) => Buffer.from(await fs.readFile(p)),
  readArrayBuffer: async (p: string) => {
    const buf = await fs.readFile(p)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  },
  readJson: async (p: string) => {
    try {
      const text = await fs.readFile(p, "utf-8")
      return JSON.parse(text)
    } catch {
      return {}
    }
  },
  write: async (p: string, content: string) => {
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, content)
  },
  writeJson: async (p: string, data: any) => {
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, JSON.stringify(data, null, 2))
  },
  mkdir: async (p: string) => {
    await fs.mkdir(p, { recursive: true })
  },
  mimeType: (filepath: string): string => {
    const ext = path.extname(filepath).toLowerCase()
    return MIME_MAP[ext] || "application/octet-stream"
  },
}
