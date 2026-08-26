-- ============================================================
-- Bizness-OS: Decoupling School Management from other modules
--
-- Removes every real data dependency School Management had on other
-- modules, while staying in the same application and database (a
-- deliberate, scoped choice — not a full multi-database/multi-service
-- split). Three couplings existed and all three are addressed here:
--
--   1. Staff: classes.class_teacher_id, timetable_entries.teacher_id,
--      transport_vehicles.driver_id, school_departments.head_employee_id,
--      and houses.house_master_id all pointed at `employees` (HR's
--      table). School now has its own `school_staff` roster — a
--      genuinely separate concept a school can manage without an HR
--      employee record existing at all. Anyone currently referenced by
--      any of these columns is backfilled into school_staff first, so
--      no existing link goes null — only the underlying table changes,
--      not what's actually assigned.
--
--   2. Banking: student_fee_payments.bank_account_id pointed at
--      `bank_accounts` (Accounting's table). School now has its own
--      `school_bank_accounts`, decoupled the same way.
--
--   3. The ledger itself: Fees Management and School Shop both posted
--      into the shared chart_of_accounts/journal_entries used by every
--      other module. School now has its own parallel
--      school_chart_of_accounts / school_journal_entries /
--      school_journal_entry_lines — genuinely separate double-entry
--      books, not just separate application tables sharing one ledger.
--      (Confirmed directly against the database before writing this:
--      zero real fee or shop transactions existed yet, so there was no
--      historical data to carry across — this is a clean cutover, not
--      a backfill of real financial history.)
-- ============================================================

-- ---------- 1. School's own staff roster ----------

CREATE TABLE school_staff (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  role              VARCHAR(100),   -- e.g. "Teacher", "Driver", "Administrator" — free text, School's own concept
  phone             VARCHAR(30),
  email             VARCHAR(150),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  _migrated_from_employee_id UUID  -- plain column, no FK — used only below to remap existing
                                    -- assignments onto the new table, dropped at the end of
                                    -- this migration so the final schema carries no trace of it
);

CREATE INDEX idx_school_staff_company ON school_staff(company_id);

INSERT INTO school_staff (company_id, first_name, last_name, phone, email, role, _migrated_from_employee_id)
SELECT DISTINCT e.company_id, e.first_name, e.last_name, e.phone, e.email, 'Staff', e.id
FROM employees e
WHERE e.id IN (
  SELECT class_teacher_id FROM classes WHERE class_teacher_id IS NOT NULL
  UNION SELECT teacher_id FROM timetable_entries WHERE teacher_id IS NOT NULL
  UNION SELECT driver_id FROM transport_vehicles WHERE driver_id IS NOT NULL
  UNION SELECT head_employee_id FROM school_departments WHERE head_employee_id IS NOT NULL
  UNION SELECT house_master_id FROM houses WHERE house_master_id IS NOT NULL
);

-- classes.class_teacher_id: employees -> school_staff
ALTER TABLE classes ADD COLUMN class_teacher_staff_id UUID REFERENCES school_staff(id) ON DELETE SET NULL;
UPDATE classes c SET class_teacher_staff_id = ss.id FROM school_staff ss WHERE ss._migrated_from_employee_id = c.class_teacher_id;
ALTER TABLE classes DROP COLUMN class_teacher_id;
ALTER TABLE classes RENAME COLUMN class_teacher_staff_id TO class_teacher_id;

-- timetable_entries.teacher_id: employees -> school_staff
ALTER TABLE timetable_entries ADD COLUMN teacher_staff_id UUID REFERENCES school_staff(id) ON DELETE SET NULL;
UPDATE timetable_entries te SET teacher_staff_id = ss.id FROM school_staff ss WHERE ss._migrated_from_employee_id = te.teacher_id;
ALTER TABLE timetable_entries DROP COLUMN teacher_id;
ALTER TABLE timetable_entries RENAME COLUMN teacher_staff_id TO teacher_id;

-- transport_vehicles.driver_id: employees -> school_staff
ALTER TABLE transport_vehicles ADD COLUMN driver_staff_id UUID REFERENCES school_staff(id) ON DELETE SET NULL;
UPDATE transport_vehicles tv SET driver_staff_id = ss.id FROM school_staff ss WHERE ss._migrated_from_employee_id = tv.driver_id;
ALTER TABLE transport_vehicles DROP COLUMN driver_id;
ALTER TABLE transport_vehicles RENAME COLUMN driver_staff_id TO driver_id;

-- school_departments.head_employee_id: employees -> school_staff (renamed to
-- head_staff_id — the old name explicitly said "employee", which would now
-- be actively misleading since it no longer points there)
ALTER TABLE school_departments ADD COLUMN head_staff_id UUID REFERENCES school_staff(id) ON DELETE SET NULL;
UPDATE school_departments sd SET head_staff_id = ss.id FROM school_staff ss WHERE ss._migrated_from_employee_id = sd.head_employee_id;
ALTER TABLE school_departments DROP COLUMN head_employee_id;

-- houses.house_master_id: employees -> school_staff
ALTER TABLE houses ADD COLUMN house_master_staff_id UUID REFERENCES school_staff(id) ON DELETE SET NULL;
UPDATE houses h SET house_master_staff_id = ss.id FROM school_staff ss WHERE ss._migrated_from_employee_id = h.house_master_id;
ALTER TABLE houses DROP COLUMN house_master_id;
ALTER TABLE houses RENAME COLUMN house_master_staff_id TO house_master_id;

ALTER TABLE school_staff DROP COLUMN _migrated_from_employee_id;

-- ---------- 2. School's own bank accounts ----------

CREATE TABLE school_bank_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_name         VARCHAR(150) NOT NULL,
  account_number    VARCHAR(50),
  account_id        UUID,  -- FK added below, once school_chart_of_accounts exists
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  _migrated_from_bank_account_id UUID  -- same pattern as school_staff above; dropped at the end
);

CREATE INDEX idx_school_bank_accounts_company ON school_bank_accounts(company_id);

INSERT INTO school_bank_accounts (company_id, bank_name, account_number, _migrated_from_bank_account_id)
SELECT DISTINCT ba.company_id, ba.bank_name, ba.account_number, ba.id
FROM bank_accounts ba
WHERE ba.id IN (SELECT bank_account_id FROM student_fee_payments WHERE bank_account_id IS NOT NULL);

ALTER TABLE student_fee_payments ADD COLUMN school_bank_account_id UUID REFERENCES school_bank_accounts(id) ON DELETE SET NULL;
UPDATE student_fee_payments sfp SET school_bank_account_id = sba.id FROM school_bank_accounts sba WHERE sba._migrated_from_bank_account_id = sfp.bank_account_id;
ALTER TABLE student_fee_payments DROP COLUMN bank_account_id;
ALTER TABLE student_fee_payments RENAME COLUMN school_bank_account_id TO bank_account_id;

-- ---------- 3. School's own chart of accounts and journal (a genuinely
--              separate double-entry ledger, not just separate tables
--              sharing one ledger) ----------

CREATE TABLE school_chart_of_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_code      VARCHAR(20) NOT NULL,
  account_name      VARCHAR(150) NOT NULL,
  account_type      VARCHAR(20) NOT NULL,   -- asset, liability, equity, revenue, expense
  normal_balance    VARCHAR(10) NOT NULL,   -- debit or credit
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, account_code)
);

CREATE TABLE school_journal_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_no          VARCHAR(30) NOT NULL,
  entry_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_type    VARCHAR(50),
  reference_id      UUID,
  description       TEXT,
  total_debit       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credit      NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, entry_no)
);

CREATE INDEX idx_school_journal_entries_company ON school_journal_entries(company_id);

CREATE TABLE school_journal_entry_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id  UUID NOT NULL REFERENCES school_journal_entries(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES school_chart_of_accounts(id),
  debit             NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit            NUMERIC(14,2) NOT NULL DEFAULT 0,
  description       TEXT
);

CREATE INDEX idx_school_journal_entry_lines_entry ON school_journal_entry_lines(journal_entry_id);
CREATE INDEX idx_school_journal_entry_lines_account ON school_journal_entry_lines(account_id);

-- Seed School's own chart of accounts — the accounts Fees Management and
-- School Shop actually need, now owned by School rather than living in
-- the shared Accounting & Finance chart.
INSERT INTO school_chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance)
SELECT c.id, t.code, t.name, t.type, t.balance
FROM companies c
CROSS JOIN (VALUES
  ('1000', 'Cash (School)', 'asset', 'debit'),
  ('1200', 'Fees Receivable', 'asset', 'debit'),
  ('1240', 'Shop Inventory', 'asset', 'debit'),
  ('4210', 'Tuition Fee Income', 'revenue', 'credit'),
  ('4220', 'Shop Sales Revenue', 'revenue', 'credit'),
  ('6080', 'Cost of Goods Sold — Shop', 'expense', 'debit')
) AS t(code, name, type, balance);

ALTER TABLE school_bank_accounts ADD CONSTRAINT school_bank_accounts_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES school_chart_of_accounts(id) ON DELETE SET NULL;

-- Give any migrated school_bank_accounts row a real school-owned GL
-- account of its own (one per bank), the same way Accounting's
-- bank_accounts.account_id already worked, just scoped to School now.
DO $$
DECLARE
  rec RECORD;
  new_account_id UUID;
  next_seq INTEGER;
BEGIN
  FOR rec IN SELECT * FROM school_bank_accounts WHERE account_id IS NULL LOOP
    SELECT COALESCE(MAX(SUBSTRING(account_code FROM 3)::INTEGER), 0) + 1 INTO next_seq
      FROM school_chart_of_accounts WHERE company_id = rec.company_id AND account_code LIKE '10%' AND account_code ~ '^\d+$';
    INSERT INTO school_chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance)
      VALUES (rec.company_id, '10' || LPAD(next_seq::TEXT, 2, '0'), rec.bank_name || ' (School)', 'asset', 'debit')
      RETURNING id INTO new_account_id;
    UPDATE school_bank_accounts SET account_id = new_account_id WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE school_bank_accounts DROP COLUMN _migrated_from_bank_account_id;
ALTER TABLE school_bank_accounts ALTER COLUMN account_id SET NOT NULL;

-- Repoint the fee invoice/payment and shop purchase/sale journal entry
-- links from the shared ledger to School's own. Safe as a clean cutover
-- — confirmed directly against the database before writing this
-- migration that zero real fee or shop transactions existed yet.
ALTER TABLE student_fee_invoices DROP COLUMN IF EXISTS journal_entry_id;
ALTER TABLE student_fee_invoices ADD COLUMN journal_entry_id UUID REFERENCES school_journal_entries(id) ON DELETE SET NULL;

ALTER TABLE student_fee_payments DROP COLUMN IF EXISTS journal_entry_id;
ALTER TABLE student_fee_payments ADD COLUMN journal_entry_id UUID REFERENCES school_journal_entries(id) ON DELETE SET NULL;

ALTER TABLE shop_purchases DROP COLUMN IF EXISTS journal_entry_id;
ALTER TABLE shop_purchases ADD COLUMN journal_entry_id UUID REFERENCES school_journal_entries(id) ON DELETE SET NULL;

ALTER TABLE shop_sales DROP COLUMN IF EXISTS journal_entry_id;
ALTER TABLE shop_sales ADD COLUMN journal_entry_id UUID REFERENCES school_journal_entries(id) ON DELETE SET NULL;

-- Reuses the existing school.view / school.manage permissions.
