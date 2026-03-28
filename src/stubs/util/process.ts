export const Process = {
  suspend: () => {},
  run: async (cmd: string[], opts?: any) => {
    try {
      const proc = Bun.spawn(cmd, {
        stdout: "pipe",
        stderr: "pipe",
        ...(opts?.nothrow ? {} : {}),
      })
      const stdout = await new Response(proc.stdout).arrayBuffer()
      const stderr = await new Response(proc.stderr).arrayBuffer()
      const exitCode = await proc.exited
      return {
        stdout: Buffer.from(stdout),
        stderr: Buffer.from(stderr),
        exitCode,
      }
    } catch {
      return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 1 }
    }
  },
  text: async (cmd: string[], opts?: any) => {
    try {
      const proc = Bun.spawn(cmd, {
        stdout: "pipe",
        stderr: "pipe",
      })
      const text = await new Response(proc.stdout).text()
      const exitCode = await proc.exited
      return { text: text.trim(), exitCode }
    } catch {
      return { text: "", exitCode: 1 }
    }
  },
  spawn: (cmd: string[], opts?: any) => {
    return Bun.spawn(cmd, opts)
  },
}
