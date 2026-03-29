import z from "zod";

export const BusEvent = {
  define<T extends z.ZodType>(name: string, schema: T) {
    return {
      name,
      type: name,
      schema,
      properties: schema,
      create: (data: z.infer<T>) => ({ type: name, data }),
    };
  },
};
