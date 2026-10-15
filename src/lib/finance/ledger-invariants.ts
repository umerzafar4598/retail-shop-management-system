import Decimal from "decimal.js";

export type LedgerAmountLine = {
  debit: Decimal;
  credit: Decimal;
};

/**
 * Validates the structural and balancing invariants of a journal.
 *
 * The ledger posting boundary must still enforce monetary precision,
 * maximum amounts, and input normalization before calling this function.
 */
export function assertBalancedLedgerAmounts(
  lines: readonly LedgerAmountLine[],
): { totalDebit: Decimal; totalCredit: Decimal } {
  if (lines.length < 2) {
    throw new Error(
      "A ledger transaction requires at least two entries.",
    );
  }

  // Reject invalid monetary values before calculating totals.
  for (const [index, line] of lines.entries()) {
    if (
      !line.debit.isFinite() ||
      !line.credit.isFinite()
    ) {
      throw new Error(
        `Line ${index + 1} must contain finite debit and credit amounts.`,
      );
    }

    if (
      line.debit.isNegative() ||
      line.credit.isNegative()
    ) {
      throw new Error(
        `Line ${index + 1} cannot contain negative amounts.`,
      );
    }
  }

  const isEntirelyZeroValue = lines.every(
    (entry) =>
      entry.debit.isZero() &&
      entry.credit.isZero(),
  );

  if (isEntirelyZeroValue) {
    throw new Error("Journal total must be greater than zero.");
  }

  // Each line must contain exactly one positive side.
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

  if (totalDebit.isZero() || totalCredit.isZero()) {
    throw new Error(
      "A ledger transaction amount must be greater than zero.",
    );
  }

  if (!totalDebit.equals(totalCredit)) {
    throw new Error(
      `Ledger transaction is unbalanced. Debit = ${totalDebit.toFixed(2)}, Credit = ${totalCredit.toFixed(2)}.`,
    );
  }

  return { totalDebit, totalCredit };
}