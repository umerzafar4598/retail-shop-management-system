#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dryRun = process.argv.includes("--dry-run");
const filePath = path.resolve(process.cwd(), "src/db/schema/audit.ts");

let source;
try {
  source = await readFile(filePath, "utf8");
} catch (error) {
  console.error(`Could not read ${filePath}. Run this script from your project root.`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

// This file defines the audit-log table. Replace only its shop FK behavior.
const pattern = /references\(\(\)\s*=>\s*shops\.id,\s*\{\s*onDelete:\s*(['"])cascade\1\s*\}\s*\)/g;
const matches = [...source.matchAll(pattern)];

if (matches.length === 0) {
  if (/references\(\(\)\s*=>\s*shops\.id,\s*\{\s*onDelete:\s*(['"])restrict\1\s*\}\s*\)/.test(source)) {
    console.log("Audit shop foreign key already uses ON DELETE RESTRICT. No changes made.");
    process.exit(0);
  }
  console.error("Could not find the expected audit_logs → shops cascade foreign key.");
  console.error("No files were changed. Inspect src/db/schema/audit.ts and update its shop FK manually if the schema has been refactored.");
  process.exit(1);
}

if (matches.length !== 1) {
  console.error(`Expected exactly one shops cascade reference in audit.ts; found ${matches.length}.`);
  console.error("No files were changed. Review src/db/schema/audit.ts manually to avoid modifying an unrelated FK.");
  process.exit(1);
}

const nextSource = source.replace(pattern, (match) => match.replace(/cascade/, "restrict"));
if (dryRun) {
  console.log("DRY RUN — no files changed.");
  console.log("Would change audit_logs → shops foreign key from ON DELETE CASCADE to ON DELETE RESTRICT.");
  console.log("This protects audit history from being deleted if a shop row is deleted.");
} else {
  await writeFile(filePath, nextSource, "utf8");
  console.log("Updated src/db/schema/audit.ts:");
  console.log("audit_logs → shops foreign key now uses ON DELETE RESTRICT.");
  console.log("Next: run db:generate, inspect the migration, then run db:migrate.");
}
