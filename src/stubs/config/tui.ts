export namespace TuiConfig {
  export type Info = {
    theme?: string
    keybinds?: Record<string, string>
    [key: string]: any
  }
  export function get(): Info {
    return {}
  }
}
