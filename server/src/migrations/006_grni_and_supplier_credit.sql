-- ---------- GRNI Clearing account (closes the goods-received-not-invoiced gap) ----------
-- Only for companies that already have a chart of accounts (i.e. the accounting module
-- has been set up). New companies get this via seedDefaultChartOfAccounts at registration.
--
-- Why: goods received (GRN) increase physical stock immediately via stockService, but
-- the GL previously only debited Inventory when the purchase invoice was entered later —
-- sometimes days or weeks after the goods physically arrived. GRNI clearing closes that
-- gap: a GRN now posts Dr Inventory / Cr GRNI Clearing at receipt time, and the later
-- purchase invoice posts Dr GRNI Clearing (for PO-linked lines) instead of Dr Inventory,
-- since the inventory value for those lines was already recognized at goods-receipt time.

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, '2050', 'Goods Received Not Invoiced (GRNI)', 'liability', 'current_liability', 'credit', TRUE
FROM companies c
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = '2050')
ON CONFLICT DO NOTHING;

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, 'grni_clearing', coa.id
FROM chart_of_accounts coa
WHERE coa.account_code = '2050'
ON CONFLICT (company_id, mapping_key) DO NOTHING;

-- ---------- Supplier credit limits (mirrors the existing customer-side soft warning) ----------
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(18,4) DEFAULT 0;
