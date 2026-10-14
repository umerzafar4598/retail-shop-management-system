import Decimal from "decimal.js";

export type LedgerAmountLine = {
  debit: Decimal;
  credit: Decimal;
};

/**
 * Pure validation shared by ledger posting and unit tests.
 * Amount normalization (finite, non-negative, max two decimal places) still
 * happens at the ledger boundary before this invariant check is called.
 */
export function assertBalancedLedgerAmounts(
  lines: readonly LedgerAmountLine[],
): { totalDebit: Decimal; totalCredit: Decimal } {
  if (!lines || lines.length < 2) {
    throw new Error("A ledger transaction requires at least two entries.");
  }

  for (const [index, line] of lines.entries()) {
    const hasDebit = line.debit.gt(0);
    const hasCredit = line.credit.gt(0);

    if (hasDebit === hasCredit) {
      throw new Error(
        `Line ${index + 1} must contain either a debit or a credit amount, but not both.`,
      );
    }
  }

  const totalDebit = lines.reduce(
    (total, line) => total.plus(line.debit),
    new Decimal(0),
  );
  const totalCredit = lines.reduce(
    (total, line) => total.plus(line.credit),
    new Decimal(0),
  );

  if (totalDebit.isZero()) {
    throw new Error("A ledger transaction amount must be greater than zero.");
  }

  if (!totalDebit.equals(totalCredit)) {
    throw new Error(
      `Ledger transaction is unbalanced. Debit = ${totalDebit.toFixed(2)}, Credit = ${totalCredit.toFixed(2)}.`,
    );
  }

  return { totalDebit, totalCredit };
}
