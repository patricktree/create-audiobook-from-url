import { z } from "zod";

export const appIdentity = { load, store };

const LOCAL_STORAGE_KEY = "app-identity";

const appIdentitySchema = z.object({
  lastGrantId: z.string(),
});

type AppIdentity = z.infer<typeof appIdentitySchema>;

function load(): AppIdentity | null {
  const keyValue = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!keyValue) {
    return null;
  }

  return appIdentitySchema.parse(JSON.parse(keyValue));
}

function store(settings: AppIdentity): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
}
