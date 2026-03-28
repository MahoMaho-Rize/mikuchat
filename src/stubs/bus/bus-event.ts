import z from "zod"

export const BusEvent = {
  define<T extends z.ZodType>(name: string, schema: T) {
    return {
      name,
      schema,
      create: (data: z.infer<T>) => ({ type: name, data }),
    }
  },
}
