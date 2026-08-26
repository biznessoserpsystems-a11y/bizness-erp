-- ============================================================
-- Bizness-OS: Petty Cash Receipts — the missing half of a real petty
-- cash book
--
-- The existing petty_cash_vouchers table already correctly posts real
-- double-entry for the payments/expenses side (Dr Expense / Cr Petty
-- Cash). What was missing is the other side a real petty cash book
-- always has: RECEIPTS — money coming into the float, whether that's
-- the very first funding of the account or a later top-up — with its
-- own genuine source (cash, bank transfer, mobile money, or cheque)
-- and its own GL posting (Dr Petty Cash / Cr wherever the money
-- actually came from).
--
-- payment_method/bank_account_id follow the exact same convention
-- already established for payroll payments (052_payroll_payment_
-- method.sql) — the same shape reused, not a new one invented for
-- this table alone.
-- ============================================================

CREATE TABLE petty_cash_receipts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  petty_cash_account_id UUID NOT NULL REFERENCES petty_cash_accounts(id) ON DELETE CASCADE,
  receipt_no            VARCHAR(50) NOT NULL,
  receipt_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  received_from         VARCHAR(150),
  payment_method        VARCHAR(30) NOT NULL DEFAULT 'cash'
                          CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_money', 'cheque', 'card')),
  bank_account_id       UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  reference_no          VARCHAR(100),  -- cheque number, mobile money transaction ID, etc.
  amount                NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  journal_entry_id      UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(petty_cash_account_id, receipt_no)
);

CREATE INDEX idx_petty_cash_receipts_account ON petty_cash_receipts(petty_cash_account_id);

-- No new permission needed — reuses whatever already gates Petty Cash.
