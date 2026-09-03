import { z } from "zod";

const LOWERCASE_UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const sourceUrlSchema = z
  .string()
  .max(2_048)
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: "custom", message: "Enter a valid absolute URL" });
      return;
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      context.addIssue({
        code: "custom",
        message: "URL must use HTTP or HTTPS and cannot contain credentials",
      });
    }
  });

const uuidV4Schema = z.string().regex(LOWERCASE_UUID_V4_PATTERN, "Must be a lowercase UUIDv4");

export const conversionParamsSchema = z
  .object({ sourceUrl: sourceUrlSchema, grantId: uuidV4Schema })
  .strict();
export type ConversionParams = z.infer<typeof conversionParamsSchema>;
