export const UI = {
  println: (...args: any[]) => console.log(...args),
  print: (...args: any[]) => process.stderr.write(args.join(" ")),
  empty: () => console.log(),
  error: (...args: any[]) => console.error(...args),
  input: async (_prompt?: string) => "",
}
