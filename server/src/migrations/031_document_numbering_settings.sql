-- ============================================================
-- Bizness-OS: Settings module — configurable document numbering
--
-- Every document number in the system (invoices, POs, quotations, GRNs,
-- etc.) was a timestamp: `${prefix}-${Date.now()}` — unique, but not what
-- any real business expects on a printed invoice, and gives no sense of
-- sequence or volume ("was this our 3rd invoice this year or our 3000th?").
--
-- document_number_sequences holds one counter per (company, prefix, year) —
-- keyed by year so numbering resets every calendar year regardless of
-- whether the company's chosen format actually includes {YEAR}, which is
-- what most businesses expect ("invoice #1" each January, not a number
-- climbing forever). The format itself is configurable per company via two
-- new columns on companies: doc_number_format (a template using {PREFIX},
-- {YEAR}, {SEQ}) and doc_number_padding (how many digits {SEQ} is padded to).
-- ============================================================

ALTER TABLE companies ADD COLUMN doc_number_format VARCHAR(60) NOT NULL DEFAULT '{PREFIX}-{YEAR}-{SEQ}';
ALTER TABLE companies ADD COLUMN doc_number_padding SMALLINT NOT NULL DEFAULT 5;

CREATE TABLE document_number_sequences (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prefix        VARCHAR(20) NOT NULL,
  year          INT NOT NULL,
  next_number   INT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, prefix, year)
);
