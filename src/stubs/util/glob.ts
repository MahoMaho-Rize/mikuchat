import { glob as nodeGlob } from "glob"

export const Glob = {
  match: async (pattern: string, opts?: any) => {
    return nodeGlob(pattern, opts)
  },
}
