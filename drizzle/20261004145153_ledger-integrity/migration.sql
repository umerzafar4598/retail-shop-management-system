-- Custom SQL migration file, put your code below! --
-- ============================================================
-- Ledger Integrity & Immutability
-- ============================================================


-- ------------------------------------------------------------
-- 1. Link ledger entries to their cash session safely
-- ------------------------------------------------------------

ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_shop_cash_session_fk"
FOREIGN KEY ("shop_id", "cash_session_id")
REFERENCES "cash_sessions" ("shop_id", "id")
ON DELETE RESTRICT;


-- ------------------------------------------------------------
-- 2. Prevent modifying or deleting ledger transactions
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION "app_prevent_ledger_transaction_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Ledger transactions are immutable. Create a reversal transaction instead.';
END;
$$;

CREATE TRIGGER "ledger_transactions_append_only"
BEFORE UPDATE OR DELETE
ON "ledger_transactions"
FOR EACH ROW
EXECUTE FUNCTION "app_prevent_ledger_transaction_mutation"();


-- ------------------------------------------------------------
-- 3. Prevent modifying or deleting ledger entries
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION "app_prevent_ledger_entry_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Ledger entries are immutable. Create a reversal transaction instead.';
END;
$$;

CREATE TRIGGER "ledger_entries_append_only"
BEFORE UPDATE OR DELETE
ON "ledger_entries"
FOR EACH ROW
EXECUTE FUNCTION "app_prevent_ledger_entry_mutation"();


-- ------------------------------------------------------------
-- 4. Verify every ledger transaction is balanced
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION "app_assert_ledger_transaction_balanced"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_transaction_id UUID;
  v_entry_count INTEGER;
  v_total_debit NUMERIC(14,2);
  v_total_credit NUMERIC(14,2);
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    v_transaction_id := NEW.id;
  ELSE
    v_transaction_id := NEW.ledger_transaction_id;
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM("debit"), 0.00),
    COALESCE(SUM("credit"), 0.00)
  INTO
    v_entry_count,
    v_total_debit,
    v_total_credit
  FROM "ledger_entries"
  WHERE "ledger_transaction_id" = v_transaction_id;

  IF v_entry_count < 2 THEN
    RAISE EXCEPTION
      'Ledger transaction % must contain at least two entries.',
      v_transaction_id;
  END IF;

  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION
      'Ledger transaction % is unbalanced. Debit: %, Credit: %.',
      v_transaction_id,
      v_total_debit,
      v_total_credit;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ledger_transactions_balance_check"
AFTER INSERT
ON "ledger_transactions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "app_assert_ledger_transaction_balanced"();

CREATE CONSTRAINT TRIGGER "ledger_entries_balance_check"
AFTER INSERT
ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "app_assert_ledger_transaction_balanced"();


-- ------------------------------------------------------------
-- 5. Prevent modifying or deleting inventory movements
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION "app_prevent_inventory_movement_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Inventory movements are immutable. Create an adjustment movement instead.';
END;
$$;

CREATE TRIGGER "inventory_movements_append_only"
BEFORE UPDATE OR DELETE
ON "inventory_movements"
FOR EACH ROW
EXECUTE FUNCTION "app_prevent_inventory_movement_mutation"();


-- ------------------------------------------------------------
-- 6. Prevent modifying or deleting audit logs
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION "app_prevent_audit_log_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Audit logs are immutable.';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE
ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "app_prevent_audit_log_mutation"();


-- ------------------------------------------------------------
-- 7. Ensure a ledger entry associated with a cash session
--    uses the ledger account belonging to that cash account
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION "app_validate_ledger_cash_session"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cash_ledger_account_id UUID;
BEGIN
  IF NEW.cash_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT fa."ledger_account_id"
  INTO v_cash_ledger_account_id
  FROM "cash_sessions" cs
  INNER JOIN "financial_accounts" fa
    ON fa."shop_id" = cs."shop_id"
   AND fa."id" = cs."financial_account_id"
  WHERE cs."shop_id" = NEW.shop_id
    AND cs."id" = NEW.cash_session_id;

  IF v_cash_ledger_account_id IS NULL THEN
    RAISE EXCEPTION
      'Cash session % does not have a valid financial account.',
      NEW.cash_session_id;
  END IF;

  IF NEW.ledger_account_id <> v_cash_ledger_account_id THEN
    RAISE EXCEPTION
      'Ledger entry account % does not match cash session % account %.',
      NEW.ledger_account_id,
      NEW.cash_session_id,
      v_cash_ledger_account_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ledger_entries_cash_session_validation"
BEFORE INSERT
ON "ledger_entries"
FOR EACH ROW
EXECUTE FUNCTION "app_validate_ledger_cash_session"();