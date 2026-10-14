import assert from "node:assert/strict";
import { test } from "node:test";
import Decimal from "decimal.js";

import { assertBalancedLedgerAmounts } from "../src/lib/finance/ledger-invariants";

const amount = (value: string) => new Decimal(value);

test("accepts a simple balanced two-line journal", () => {
  const totals = assertBalancedLedgerAmounts([
    { debit: amount("700.00"), credit: amount("0.00") },
    { debit: amount("0.00"), credit: amount("700.00") },
  ]);

  assert.equal(totals.totalDebit.toFixed(2), "700.00");
  assert.equal(totals.totalCredit.toFixed(2), "700.00");
});

test("accepts balanced journals with multiple debit and credit entries", () => {
  const totals = assertBalancedLedgerAmounts([
    { debit: amount("300.00"), credit: amount("0.00") },
    { debit: amount("400.00"), credit: amount("0.00") },
    { debit: amount("0.00"), credit: amount("500.00") },
    { debit: amount("0.00"), credit: amount("200.00") },
  ]);

  assert.equal(totals.totalDebit.toFixed(2), "700.00");
  assert.equal(totals.totalCredit.toFixed(2), "700.00");
});

test("rejects a journal with fewer than two entries", () => {
  assert.throws(
    () => assertBalancedLedgerAmounts([
      { debit: amount("10.00"), credit: amount("0.00") },
    ]),
    /at least two entries/i,
  );
});

test("rejects a line with both a debit and a credit", () => {
  assert.throws(
    () => assertBalancedLedgerAmounts([
      { debit: amount("10.00"), credit: amount("5.00") },
      { debit: amount("0.00"), credit: amount("5.00") },
    ]),
    /either a debit or a credit/i,
  );
});

test("rejects a line with neither a debit nor a credit", () => {
  assert.throws(
    () => assertBalancedLedgerAmounts([
      { debit: amount("0.00"), credit: amount("0.00") },
      { debit: amount("10.00"), credit: amount("0.00") },
    ]),
    /either a debit or a credit/i,
  );
});

test("rejects an entirely zero-value journal", () => {
  assert.throws(
    () => assertBalancedLedgerAmounts([
      { debit: amount("0.00"), credit: amount("0.00") },
      { debit: amount("0.00"), credit: amount("0.00") },
    ]),
    /greater than zero/i,
  );
});

test("rejects an unbalanced journal and includes its totals", () => {
  assert.throws(
    () => assertBalancedLedgerAmounts([
      { debit: amount("100.00"), credit: amount("0.00") },
      { debit: amount("0.00"), credit: amount("99.99") },
    ]),
    /Debit = 100\.00, Credit = 99\.99/i,
  );
});
