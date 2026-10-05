import "dotenv/config";

import { sql } from "drizzle-orm";

import { db, pool } from "./client";

async function main() {
  const result = await db.execute(sql`
    SELECT
      1 AS connected,
      current_database() AS database_name,
      current_user AS database_user,
      current_setting('TIMEZONE') AS timezone
  `);

  console.table(result.rows);
  console.log("Database connection OK.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
