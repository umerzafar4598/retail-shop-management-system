import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not configured. The integrity audit was not run.");
  process.exit(2);
}

const sampleLimit = 10;
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
const client = await pool.connect();
let failed = false;
let beganReadOnly = false;

async function runCheck(label, query, values = []) {
  try {
    const result = await client.query(query, values);
    if (result.rows.length === 0) {
      console.log(`PASS  ${label}`);
      return;
    }

    failed = true;
    console.error(`FAIL  ${label} — ${result.rows.length} issue(s) shown (maximum ${sampleLimit}).`);
    for (const row of result.rows) console.error(`      ${JSON.stringify(row)}`);
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : "Unknown query error";
    console.error(`ERROR ${label} — ${message}`);
  }
}

try {
  await client.query("BEGIN TRANSACTION READ ONLY");
  beganReadOnly = true;
  await client.query("SET LOCAL statement_timeout = '20000ms'");

  console.log("Phase 15 Read-only Database Integrity Audit");
  console.log("Mode: READ ONLY — no business records will be inserted, updated, or deleted.\n");

  await runCheck(
    "Every ledger transaction has at least two entries and equal debits/credits",
    `WITH totals AS (
       SELECT
         lt.shop_id,
         lt.id AS transaction_id,
         lt.reference_type,
         lt.reference_id,
         COUNT(le.id)::int AS entry_count,
         COALESCE(SUM(le.debit::numeric), 0) AS total_debit,
         COALESCE(SUM(le.credit::numeric), 0) AS total_credit
       FROM ledger_transactions lt
       LEFT JOIN ledger_entries le
         ON le.shop_id = lt.shop_id
        AND le.ledger_transaction_id = lt.id
       GROUP BY lt.shop_id, lt.id, lt.reference_type, lt.reference_id
     )
     SELECT shop_id, transaction_id, reference_type, reference_id,
            entry_count, total_debit::text, total_credit::text
     FROM totals
     WHERE entry_count < 2 OR total_debit <> total_credit
     ORDER BY shop_id, transaction_id
     LIMIT $1`,
    [sampleLimit],
  );

  await runCheck(
    "Inventory balance quantities match the immutable movement history",
    `WITH movement_totals AS (
       SELECT shop_id, variant_id, SUM(quantity_delta)::bigint AS movement_quantity
       FROM inventory_movements
       GROUP BY shop_id, variant_id
     ), reconciled AS (
       SELECT
         COALESCE(ib.shop_id, mt.shop_id) AS shop_id,
         COALESCE(ib.variant_id, mt.variant_id) AS variant_id,
         COALESCE(ib.quantity, 0)::bigint AS balance_quantity,
         COALESCE(mt.movement_quantity, 0)::bigint AS movement_quantity
       FROM inventory_balances ib
       FULL OUTER JOIN movement_totals mt
         ON mt.shop_id = ib.shop_id
        AND mt.variant_id = ib.variant_id
     )
     SELECT shop_id, variant_id, balance_quantity, movement_quantity
     FROM reconciled
     WHERE balance_quantity <> movement_quantity
     ORDER BY shop_id, variant_id
     LIMIT $1`,
    [sampleLimit],
  );

  await runCheck(
    "Every financial account maps to a debit-normal asset leaf account",
    `SELECT
       fa.shop_id,
       fa.id AS financial_account_id,
       fa.name AS financial_account_name,
       fa.kind,
       la.id AS ledger_account_id,
       la.name AS ledger_account_name,
       la.account_type,
       la.normal_balance
     FROM financial_accounts fa
     LEFT JOIN ledger_accounts la
       ON la.shop_id = fa.shop_id
      AND la.id = fa.ledger_account_id
     WHERE la.id IS NULL
        OR la.account_type <> 'ASSET'
        OR la.normal_balance <> 'DEBIT'
        OR EXISTS (
          SELECT 1 FROM ledger_accounts child
          WHERE child.shop_id = la.shop_id
            AND child.parent_id = la.id
        )
     ORDER BY fa.shop_id, fa.name
     LIMIT $1`,
    [sampleLimit],
  );

  await runCheck(
    "Retail and Services drawer defaults point to active, valid CASH accounts",
    `SELECT
       d.shop_id,
       d.purpose,
       d.financial_account_id,
       fa.name AS financial_account_name,
       fa.kind,
       fa.is_active,
       la.account_type,
       la.normal_balance
     FROM cash_drawer_defaults d
     LEFT JOIN financial_accounts fa
       ON fa.shop_id = d.shop_id
      AND fa.id = d.financial_account_id
     LEFT JOIN ledger_accounts la
       ON la.shop_id = fa.shop_id
      AND la.id = fa.ledger_account_id
     WHERE fa.id IS NULL
        OR fa.kind <> 'CASH'
        OR fa.is_active = FALSE
        OR la.id IS NULL
        OR la.active = FALSE
        OR la.account_type <> 'ASSET'
        OR la.normal_balance <> 'DEBIT'
        OR EXISTS (
          SELECT 1 FROM ledger_accounts child
          WHERE child.shop_id = la.shop_id
            AND child.parent_id = la.id
        )
     ORDER BY d.shop_id, d.purpose
     LIMIT $1`,
    [sampleLimit],
  );

  await runCheck(
    "No financial account has multiple OPEN cash sessions",
    `SELECT shop_id, financial_account_id, COUNT(*)::int AS open_sessions
     FROM cash_sessions
     WHERE status = 'OPEN'
     GROUP BY shop_id, financial_account_id
     HAVING COUNT(*) > 1
     ORDER BY shop_id, financial_account_id
     LIMIT $1`,
    [sampleLimit],
  );

  await runCheck(
    "Closed/reconciliation-required cash sessions contain their closing amounts",
    `SELECT shop_id, id AS cash_session_id, status,
            expected_closing_amount::text,
            actual_closing_amount::text,
            difference::text,
            closed_at
     FROM cash_sessions
     WHERE status IN ('CLOSED', 'RECONCILIATION_REQUIRED')
       AND (expected_closing_amount IS NULL
         OR actual_closing_amount IS NULL
         OR difference IS NULL
         OR closed_at IS NULL)
     ORDER BY shop_id, opened_at DESC
     LIMIT $1`,
    [sampleLimit],
  );

  await runCheck(
    "Required shop-scoped composite foreign keys exist and are validated",
    `WITH required(table_name, constraint_name) AS (
       VALUES
         ('financial_accounts', 'financial_accounts_shop_ledger_fk'),
         ('cash_sessions', 'cash_sessions_shop_account_fk'),
         ('account_transfers', 'account_transfers_shop_source_fk'),
         ('account_transfers', 'account_transfers_shop_destination_fk'),
         ('cash_drawer_defaults', 'cash_drawer_defaults_shop_account_fk'),
         ('ledger_entries', 'ledger_entries_shop_transaction_fk'),
         ('ledger_entries', 'ledger_entries_shop_account_fk'),
         ('sales', 'sales_shop_customer_fk'),
         ('sale_items', 'sale_items_shop_sale_fk'),
         ('sale_payments', 'sale_payments_shop_sale_fk'),
         ('sale_payments', 'sale_payments_shop_account_fk'),
         ('purchase_items', 'purchase_items_shop_purchase_fk'),
         ('purchase_items', 'purchase_items_shop_variant_fk')
     )
     SELECT r.table_name, r.constraint_name
     FROM required r
     JOIN pg_class rel ON rel.relname = r.table_name
     JOIN pg_namespace ns ON ns.oid = rel.relnamespace AND ns.nspname = 'public'
     LEFT JOIN pg_constraint c
       ON c.conrelid = rel.oid
      AND c.conname = r.constraint_name
      AND c.contype = 'f'
      AND c.convalidated = TRUE
     WHERE c.oid IS NULL
     ORDER BY r.table_name, r.constraint_name
     LIMIT $1`,
    [sampleLimit],
  );

  await runCheck(
    "Audit history cannot be cascade-deleted with its shop",
    `SELECT
       conname AS constraint_name,
       pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE conrelid = 'public.audit_logs'::regclass
       AND confrelid = 'public.shops'::regclass
       AND contype = 'f'
       AND position('ON DELETE RESTRICT' in pg_get_constraintdef(oid)) = 0
     UNION ALL
     SELECT 'MISSING_AUDIT_SHOP_FK'::text, 'No audit_logs-to-shops foreign key was found'::text
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.audit_logs'::regclass
         AND confrelid = 'public.shops'::regclass
         AND contype = 'f'
     )
     LIMIT $1`,
    [sampleLimit],
  );

  await client.query("ROLLBACK");
  beganReadOnly = false;

  if (failed) {
    console.error("\nIntegrity audit found issues. No data was changed. Review each FAIL/ERROR before proceeding.");
    process.exitCode = 1;
  } else {
    console.log("\nAll read-only integrity checks passed. No data was changed.");
  }
} catch (error) {
  if (beganReadOnly) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
  }
  const message = error instanceof Error ? error.message : "Unknown database error";
  console.error(`Integrity audit could not complete: ${message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
