import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import {
  relations,
  authRelations,
} from "./relations";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const pool = new Pool({
  connectionString,
});

export { pool };

export const db = drizzle({
  client: pool,

  relations: {
    ...relations,
    ...authRelations,
  },
});