import { execSync } from "child_process"

export function which(cmd: string): string | undefined {
  try {
    return execSync(`which ${cmd}`, { encoding: "utf-8" }).trim() || undefined
  } catch {
    return undefined
  }
}
