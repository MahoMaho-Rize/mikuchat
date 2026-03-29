export const Instance = {
  directory: () => process.cwd(),
  bind: (fn: any) => fn,
  provide: async (opts: { directory: string; fn: () => any }) => opts.fn(),
};
