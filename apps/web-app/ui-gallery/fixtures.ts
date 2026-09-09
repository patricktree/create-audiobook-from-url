import { ConversionPhase } from "@create-audiobook-from-url/conversion-grants/contracts";
import type {
  ConversionDetail,
  GrantSnapshot,
} from "@create-audiobook-from-url/web-app-api.routes";

const GRANT_ID = "b4ad28a8-bbd7-46af-a17c-59527becd745";
export const OPEN_GRANT_RESPONSE = {
  grantId: GRANT_ID,
  createdAt: "2026-08-28T10:00:00Z",
  expiresAt: "2026-11-26T10:00:00Z",
  state: "open",
  slots: { remaining: 5, reserved: 0, spent: 0 },
} satisfies GrantSnapshot;

export const PENDING_CONVERSION_RESPONSE = {
  conversionId: "a3fcb5d8-9162-4c1a-b804-3be130c5e92a",
  sourceUrl: "https://example.com/article",
  acceptedAt: "2026-08-28T10:05:00Z",
  status: "pending",
  lastStartedPhase: ConversionPhase.NARRATION_CONTENT_SELECTION,
} satisfies ConversionDetail;
