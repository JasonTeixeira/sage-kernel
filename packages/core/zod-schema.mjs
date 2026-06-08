import * as z from "zod/v4";

export function zodFromJsonSchema(schema = { type: "object" }) {
  if (schema.type !== "object") return z.object({}).passthrough();
  const shape = {};
  const required = new Set(schema.required || []);
  for (const [key, value] of Object.entries(schema.properties || {})) {
    let field = zodField(value);
    if (!required.has(key)) field = field.optional();
    shape[key] = field;
  }
  return z.object(shape);
}

function zodField(schema = {}) {
  if (schema.type === "string") return z.string();
  if (schema.type === "number" || schema.type === "integer") return z.number();
  if (schema.type === "boolean") return z.boolean();
  if (schema.type === "array") return z.array(zodField(schema.items || {}));
  if (schema.type === "object") return z.object({}).passthrough();
  return z.any();
}
