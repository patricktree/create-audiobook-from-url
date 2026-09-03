export { ConversionGrantDurableObject, ConversionGrantRegistryDurableObject } from "#src/index.ts";

export default {
  fetch(): Response {
    return new Response("Conversion grant test Worker");
  },
} satisfies ExportedHandler;
