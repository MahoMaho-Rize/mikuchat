export const Instance = {
  directory: () => process.cwd(),
  bind: (fn: any) => fn,
}
