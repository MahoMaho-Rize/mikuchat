// NapCat process manager - launch, monitor, stop
import { spawn, type Subprocess } from "bun"
import path from "path"
import os from "os"
import fs from "fs"

export type NapCatStatus = "stopped" | "starting" | "wait_login" | "running" | "error"

export interface NapCatConfig {
  qqPath: string // path to QQ binary (env NAPCAT_QQ_PATH or auto-detected)
  account?: string // QQ number for quick login
  display?: string // X display (default :99)
}

// Probe common NapCat installation locations
function findQQBinary(): string {
  const home = os.homedir()
  const candidates = [
    process.env.NAPCAT_QQ_PATH,                        // explicit env override
    path.join(home, "NapCat/opt/QQ/qq"),               // ~/NapCat/opt/QQ/qq
    path.join(home, "Napcat/opt/QQ/qq"),               // ~/Napcat/opt/QQ/qq (case variant)
    path.join(home, ".local/share/NapCat/opt/QQ/qq"),  // XDG style
    "/opt/QQ/qq",                                      // system-wide
    "/usr/local/share/NapCat/opt/QQ/qq",
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  // Return the most common default; start() will report the error if it's missing
  return path.join(home, "NapCat/opt/QQ/qq")
}

export class NapCatManager {
  private proc: Subprocess | null = null
  private xvfbProc: Subprocess | null = null
  private _status: NapCatStatus = "stopped"
  private statusHandlers: Set<(status: NapCatStatus, info?: string) => void> = new Set()
  private logHandlers: Set<(line: string) => void> = new Set()
  private config: NapCatConfig

  constructor(config?: Partial<NapCatConfig>) {
    this.config = {
      qqPath: config?.qqPath ?? findQQBinary(),
      account: config?.account,
      display: config?.display ?? ":99",
    }
  }

  get status() {
    return this._status
  }

  onStatus(handler: (status: NapCatStatus, info?: string) => void): () => void {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  onLog(handler: (line: string) => void): () => void {
    this.logHandlers.add(handler)
    return () => this.logHandlers.delete(handler)
  }

  private setStatus(s: NapCatStatus, info?: string) {
    this._status = s
    for (const h of this.statusHandlers) h(s, info)
  }

  private emitLog(line: string) {
    for (const h of this.logHandlers) h(line)
  }

  async start(): Promise<void> {
    if (this.proc) return

    // Verify QQ binary exists
    if (!fs.existsSync(this.config.qqPath)) {
      this.setStatus("error", `QQ binary not found: ${this.config.qqPath}`)
      return
    }

    this.setStatus("starting")

    // Start Xvfb if not already running
    try {
      this.xvfbProc = spawn(["Xvfb", this.config.display, "-screen", "0", "1024x768x24"], {
        stdout: "ignore",
        stderr: "ignore",
      })
    } catch {
      // Xvfb may already be running, that's fine
    }

    await new Promise((r) => setTimeout(r, 500))

    // Build args
    const args = [
      this.config.qqPath,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-software-rasterizer",
    ]
    if (this.config.account) {
      args.push("-q", this.config.account)
    }

    // Start QQ + NapCat
    this.proc = spawn(args, {
      env: {
        ...process.env,
        DISPLAY: this.config.display,
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    this.emitLog("[NapCat] Starting QQ...")

    // Read stdout/stderr for status detection
    this.readStream(this.proc.stdout, false)
    this.readStream(this.proc.stderr, true)

    // Monitor exit
    this.proc.exited.then((code) => {
      this.proc = null
      this.setStatus("stopped")
      this.emitLog(`[NapCat] Process exited with code ${code}`)
    })
  }

  private async readStream(stream: ReadableStream<Uint8Array> | null, isStderr: boolean) {
    if (!stream) return
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop()!
        for (const line of lines) {
          this.processLogLine(line)
        }
      }
      if (buffer) this.processLogLine(buffer)
    } catch {}
  }

  private processLogLine(line: string) {
    // Strip ANSI codes for matching
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "").trim()
    if (!clean) return

    this.emitLog(clean)

    // Detect status from log output
    if (clean.includes("WebUi User Panel Url")) {
      // NapCat core is up
    }
    if (clean.includes("请扫描下面的二维码") || clean.includes("二维码已保存到")) {
      this.setStatus("wait_login", "请用手机QQ扫码登录")
    }
    if (clean.includes("二维码解码URL:")) {
      const url = clean.replace(/.*二维码解码URL:\s*/, "").trim()
      this.setStatus("wait_login", url)
    }
    if (clean.includes("[OneBot] [WebSocket Server]") && clean.includes("已启动")) {
      this.setStatus("running")
    }
    // Fallback: WS port listening means we're ready
    if (clean.includes("qqterm") && clean.includes("已启动")) {
      this.setStatus("running")
    }
    // Login success indicators
    if (clean.includes("登录成功") || clean.includes("QQ登录")) {
      this.setStatus("running")
    }
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
    if (this.xvfbProc) {
      this.xvfbProc.kill()
      this.xvfbProc = null
    }
    this.setStatus("stopped")
    this.emitLog("[NapCat] Stopped")
  }

  isRunning(): boolean {
    return this.proc !== null
  }
}
