import type {
  ConversionGrantDurableObject,
  ConversionGrantRegistryDurableObject,
} from "@create-audiobook-from-url/conversion-grants";
import type { ConversionParams } from "@create-audiobook-from-url/create-audiobook-from-url-workflow/runner";

export type ApiServerEnvironment = {
  CREATE_AUDIOBOOK_FROM_URL_WORKFLOW: Workflow<ConversionParams>;
  ASSETS: Fetcher;
  AUDIO_BUCKET: R2Bucket;
  CONVERSION_GRANTS: DurableObjectNamespace<ConversionGrantDurableObject>;
  CONVERSION_GRANT_REGISTRY: DurableObjectNamespace<ConversionGrantRegistryDurableObject>;
  OPERATOR_ACCESS_ISSUER?: string;
  OPERATOR_ACCESS_AUDIENCE?: string;
  OPERATOR_EMAIL?: string;
};
