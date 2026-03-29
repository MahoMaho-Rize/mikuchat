import type { ParsedKey } from "@opentui/core";

export type Info = ParsedKey & {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  super?: boolean;
};

export const Keybind = {
  parse: (str: string): Info[] => [{ name: str } as any],
  fromParsedKey: (evt: any, _leader?: boolean): Info => evt as Info,
  match: (a: any, b: any): boolean => {
    if (!a || !b) return false;
    return (
      a.name === b.name &&
      !!a.ctrl === !!b.ctrl &&
      !!a.meta === !!b.meta &&
      !!a.shift === !!b.shift
    );
  },
  print: (key: any): string => {
    if (typeof key === "string") return key;
    if (!key) return "";
    const parts: string[] = [];
    if (key.ctrl) parts.push("ctrl");
    if (key.meta) parts.push("meta");
    if (key.shift) parts.push("shift");
    parts.push(key.name ?? "");
    return parts.join("+");
  },
  toString: (key: any): string => {
    if (!key) return "";
    return Keybind.print(key);
  },
};

export namespace Keybind {
  export type Info = ParsedKey & {
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    super?: boolean;
  };
}
