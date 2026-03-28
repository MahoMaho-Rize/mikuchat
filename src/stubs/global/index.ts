import path from "path"
import os from "os"
import fs from "fs"

const dataDir = path.join(os.homedir(), ".local", "share", "mikuchat")
const configDir = path.join(os.homedir(), ".config", "mikuchat")
const stateDir = path.join(dataDir, "state")

// Ensure dirs exist
for (const dir of [dataDir, configDir, stateDir]) {
  fs.mkdirSync(dir, { recursive: true })
}

export const Global = {
  Path: {
    home: os.homedir(),
    config: configDir,
    data: dataDir,
    state: stateDir,
    cache: path.join(os.homedir(), ".cache", "mikuchat"),
  },
}
