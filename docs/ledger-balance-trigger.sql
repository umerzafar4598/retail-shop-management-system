-- Add this SQL to the first generated Drizzle migration after
-- ledger_transactions and ledger_entries exist.
--
-- It enforces two important invariants:
-- 1. Every journal must balance at COMMIT time.
-- 2. Posted ledger history is append-only: UPDATE/DELETE is blocked.

CREATE OR REPLACE FUNCTION assert_ledger_entry_transaction_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction_id uuid;
  total_debit numeric(14,2);
  total_credit numeric(14,2);
BEGIN
  target_transaction_id := COALESCE(NEW.ledger_transaction_id, OLD.ledger_transaction_id);

  SELECT
    COALESCE(SUM(debit), 0)::numeric(14,2),
    COALESCE(SUM(credit), 0)::numeric(14,2)
  INTO total_debit, total_credit
  FROM ledger_entries
  WHERE ledger_transaction_id = target_transaction_id;

  IF total_debit = 0 AND total_credit = 0 THEN
    RAISE EXCEPTION
      'Ledger transaction % must contain at least one non-zero entry',
      target_transaction_id;
  END IF;

  IF total_debit <> total_credit THEN
    RAISE EXCEPTION
      'Ledger transaction % is unbalanced: debit=% credit=%',
      target_transaction_id,
      total_debit,
      total_credit;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION assert_ledger_transaction_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  total_debit numeric(14,2);
  total_credit numeric(14,2);
BEGIN
  SELECT
    COALESCE(SUM(debit), 0)::numeric(14,2),
    COALESCE(SUM(credit), 0)::numeric(14,2)
  INTO total_debit, total_credit
  FROM ledger_entries
  WHERE ledger_transaction_id = NEW.id;

  IF total_debit = 0 AND total_credit = 0 THEN
    RAISE EXCEPTION
      'Ledger transaction % must contain at least one non-zero entry',
      NEW.id;
  END IF;

  IF total_debit <> total_credit THEN
    RAISE EXCEPTION
      'Ledger transaction % is unbalanced: debit=% credit=%',
      NEW.id,
      total_debit,
      total_credit;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced_trigger
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_ledger_entry_transaction_balanced();

CREATE CONSTRAINT TRIGGER ledger_transactions_balanced_trigger
AFTER INSERT ON ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_ledger_transaction_balanced();

CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Ledger history is immutable; create a reversal or adjustment instead.';
END;
$$;

CREATE TRIGGER ledger_entries_immutable_trigger
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TRIGGER ledger_transactions_immutable_trigger
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_mutation();

-- Inventory movements and audit logs are also append-only historical records.
CREATE OR REPLACE FUNCTION prevent_append_only_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Historical records are immutable; create a new correction/adjustment instead.';
END;
$$;

CREATE TRIGGER inventory_movements_immutable_trigger
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW
EXECUTE FUNCTION prevent_append_only_history_mutation();

CREATE TRIGGER audit_logs_immutable_trigger
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_append_only_history_mutation();
