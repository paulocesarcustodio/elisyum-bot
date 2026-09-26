import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import path from "node:path";
import * as schema from "./schema";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || "../storage/bot.db");

const client = createClient({
  url: `file:${dbPath}`,
});

export const db = drizzle(client, { schema });
