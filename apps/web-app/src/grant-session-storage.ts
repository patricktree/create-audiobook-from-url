import { z } from "zod";

export const grantSessionStorage = { load, store };

const LOCAL_STORAGE_KEY = "grant-session";
const sessionSchema = z.object({ token: z.string() });

type GrantSession = z.infer<typeof sessionSchema>;

function load(): GrantSession | null {
  const value = localStorage.getItem(LOCAL_STORAGE_KEY);
  return value === null ? null : sessionSchema.parse(JSON.parse(value));
}

function store(session: GrantSession): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(session));
}
