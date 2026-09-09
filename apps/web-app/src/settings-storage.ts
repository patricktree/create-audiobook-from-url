import { z } from "zod";

export const settingsStorage = { load, store };

const LOCAL_STORAGE_KEY = "settings";

const settingsSchema = z.object({
  lastGrantId: z.string(),
});

type Settings = z.infer<typeof settingsSchema>;

function load(): Settings | null {
  const keyValue = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!keyValue) {
    return null;
  }

  return settingsSchema.parse(JSON.parse(keyValue));
}

function store(settings: Settings): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
}
