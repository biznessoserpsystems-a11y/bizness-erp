-- ============================================================
-- Bizness-OS: Rental payment recording
--
-- rental_charges already posts Dr Accounts Receivable / Cr Rental Income
-- the moment a charge is billed — but there was no way to record that the
-- customer actually paid it. Without that, "Outstanding Customer
-- Payments" on the workspace dashboard would have nothing real to
-- subtract from total billed, and would just show total billed forever,
-- even for agreements paid in full. This adds the other half of that
-- pair: a real payment record (Dr Bank / Cr Accounts Receivable) against
-- an agreement.
-- ============================================================

CREATE TABLE rental_payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agreement_id      UUID NOT NULL REFERENCES rental_agreements(id) ON DELETE CASCADE,
  amount            NUMERIC(18,4) NOT NULL,
  bank_account_id   UUID NOT NULL REFERENCES bank_accounts(id),
  journal_entry_id  UUID REFERENCES journal_entries(id),
  notes             TEXT,
  recorded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rental_payments_agreement ON rental_payments(agreement_id);
