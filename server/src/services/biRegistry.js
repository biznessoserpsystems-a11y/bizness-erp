// The whitelist that makes an "ad-hoc" report builder safe. A person
// building a report never sends SQL, a table name, or a column name —
// they send a data source KEY and field KEYS, each of which is looked up
// here against a fixed, hand-written SQL expression. If a key isn't in
// this registry, the request is rejected before a single query is built,
// let alone executed. This is the one file that determines what's
// actually queryable through this feature — every data source, every
// dimension, every metric, and the exact SQL each one maps to.
//
// requiredPermission gates the data source itself (not a new BI-specific
// permission) — a report can only ever surface data the person could
// already see through some existing report in this app.

const DATA_SOURCES = {
  sales_invoices: {
    label: 'Sales Invoices',
    domain: 'general',
    requiredPermission: 'sales.reports.view',
    from: 'sales_invoices si JOIN customers c ON c.id = si.customer_id',
    companyIdColumn: 'si.company_id',
    dimensions: {
      customer: { label: 'Customer', sql: 'c.name' },
      status: { label: 'Status', sql: 'si.status' },
      month: { label: 'Month', sql: `to_char(si.invoice_date, 'YYYY-MM')` },
    },
    metrics: {
      total_amount: { label: 'Total Amount', sql: 'si.total_amount' },
      tax_amount: { label: 'Tax Amount', sql: 'si.tax_amount' },
    },
  },
  purchase_invoices: {
    label: 'Purchase Invoices',
    domain: 'general',
    requiredPermission: 'procurement.reports.view',
    from: 'purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id',
    companyIdColumn: 'pi.company_id',
    dimensions: {
      supplier: { label: 'Supplier', sql: 's.name' },
      status: { label: 'Status', sql: 'pi.status' },
      month: { label: 'Month', sql: `to_char(pi.invoice_date, 'YYYY-MM')` },
    },
    metrics: {
      total_amount: { label: 'Total Amount', sql: 'pi.total_amount' },
    },
  },
  products: {
    label: 'Products',
    domain: 'general',
    requiredPermission: 'inventory.reports.view',
    from: 'products p LEFT JOIN product_categories pc ON pc.id = p.category_id',
    companyIdColumn: 'p.company_id',
    dimensions: {
      category: { label: 'Category', sql: `COALESCE(pc.name, 'Uncategorized')` },
    },
    metrics: {
      cost_price: { label: 'Cost Price', sql: 'p.cost_price' },
      selling_price: { label: 'Selling Price', sql: 'p.selling_price' },
      reorder_level: { label: 'Reorder Level', sql: 'p.reorder_level' },
    },
  },
  employees: {
    label: 'Employees',
    domain: 'general',
    requiredPermission: 'hr.reports.view',
    from: 'employees e',
    companyIdColumn: 'e.company_id',
    dimensions: {
      department: { label: 'Department', sql: `COALESCE(e.department, 'Unassigned')` },
      employment_status: { label: 'Employment Status', sql: 'e.employment_status' },
      gender: { label: 'Gender', sql: `COALESCE(e.gender, 'Unspecified')` },
    },
    metrics: {
      basic_salary: { label: 'Basic Salary', sql: 'e.basic_salary' },
      allowances: { label: 'Allowances', sql: 'e.allowances' },
    },
  },

  // The general ledger — every posted or draft journal line, joined to
  // its account. Not a pre-built Trial Balance, Income Statement,
  // Statement of Financial Position, or Statement of Cash Flows (all
  // four already exist as their own dedicated pages under Accounting &
  // Finance) — this is the raw material those are built from, exposed
  // here so someone can construct their own version of any of them.
  // Group by account_type and add both Debit and Credit as separate sum
  // metrics for a trial-balance-style view; filter account_type to
  // revenue/expense for an income-statement-style breakdown; filter to
  // asset/liability/equity for a balance-sheet-style one — all without
  // this registry needing to hardcode four separate statement shapes.
  // Reversed entries are excluded at the join itself (je.status !=
  // 'reversed'), matching the exact same convention every other
  // financial-statement query in this codebase already follows — not
  // "posted only", since draft entries are real too, just not final.
  general_ledger: {
    label: 'General Ledger (build any Financial Statement)',
    domain: 'general',
    requiredPermission: 'accounting.ledger.view',
    from: `journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status != 'reversed'
           JOIN chart_of_accounts coa ON coa.id = jel.account_id`,
    companyIdColumn: 'je.company_id',
    dimensions: {
      account_name: { label: 'Account', sql: 'coa.account_name' },
      account_type: { label: 'Account Type', sql: 'coa.account_type' },
      account_subtype: { label: 'Account Subtype', sql: `COALESCE(coa.account_subtype, 'Unclassified')` },
      month: { label: 'Month', sql: `to_char(je.entry_date, 'YYYY-MM')` },
      source: { label: 'Source', sql: 'je.reference_type' },
    },
    metrics: {
      debit: { label: 'Debit', sql: 'jel.debit' },
      credit: { label: 'Credit', sql: 'jel.credit' },
    },
  },

  // Four School Management data sources — Academic Intelligence's report
  // builder half. School's own tables, not the main app's — this module
  // was deliberately decoupled from Accounting/HR/Banking earlier in
  // this project (classes.class_teacher_id points at school_staff, not
  // employees; student_fee_payments.bank_account_id points at
  // school_bank_accounts, not bank_accounts), confirmed directly against
  // the actual decoupling migration before writing any of these joins,
  // not assumed from an older migration file that predates it.
  students: {
    label: 'Students',
    domain: 'school',
    requiredPermission: 'school.view',
    from: 'students s LEFT JOIN classes cl ON cl.id = s.class_id',
    companyIdColumn: 's.company_id',
    dimensions: {
      class_name: { label: 'Class', sql: `COALESCE(cl.name, 'Unassigned')` },
      grade_level: { label: 'Grade Level', sql: `COALESCE(cl.grade_level, 'Unassigned')` },
      status: { label: 'Status', sql: 's.status' },
      gender: { label: 'Gender', sql: `COALESCE(s.gender, 'Unspecified')` },
    },
    metrics: {
      count: { label: 'Number of Students', sql: 's.id' },
    },
  },
  student_attendance: {
    label: 'Student Attendance',
    domain: 'school',
    requiredPermission: 'school.view',
    from: 'student_attendance sa LEFT JOIN classes cl ON cl.id = sa.class_id',
    companyIdColumn: 'sa.company_id',
    dimensions: {
      class_name: { label: 'Class', sql: `COALESCE(cl.name, 'Unassigned')` },
      status: { label: 'Status', sql: 'sa.status' },
      month: { label: 'Month', sql: `to_char(sa.attendance_date, 'YYYY-MM')` },
    },
    metrics: {
      count: { label: 'Attendance Records', sql: 'sa.id' },
    },
  },
  exam_results: {
    label: 'Exam Results',
    domain: 'school',
    requiredPermission: 'school.view',
    from: `exam_results er
           JOIN subjects sub ON sub.id = er.subject_id
           JOIN exams ex ON ex.id = er.exam_id
           LEFT JOIN classes cl ON cl.id = ex.class_id`,
    companyIdColumn: 'er.company_id',
    dimensions: {
      subject: { label: 'Subject', sql: 'sub.name' },
      exam_name: { label: 'Exam', sql: 'ex.name' },
      term: { label: 'Term', sql: 'ex.term' },
      academic_year: { label: 'Academic Year', sql: 'ex.academic_year' },
      class_name: { label: 'Class', sql: `COALESCE(cl.name, 'Unassigned')` },
    },
    metrics: {
      score: { label: 'Score', sql: 'er.score' },
    },
  },
  student_fee_payments: {
    label: 'School Fee Payments',
    domain: 'school',
    requiredPermission: 'school.view',
    from: 'student_fee_payments sfp JOIN student_fee_invoices sfi ON sfi.id = sfp.invoice_id',
    companyIdColumn: 'sfp.company_id',
    dimensions: {
      payment_method: { label: 'Payment Method', sql: 'sfp.payment_method' },
      month: { label: 'Month', sql: `to_char(sfp.payment_date, 'YYYY-MM')` },
    },
    metrics: {
      amount: { label: 'Amount', sql: 'sfp.amount' },
    },
  },
};

const AGGREGATIONS = {
  sum: { label: 'Sum', sql: 'SUM' },
  avg: { label: 'Average', sql: 'AVG' },
  count: { label: 'Count', sql: 'COUNT' },
  min: { label: 'Minimum', sql: 'MIN' },
  max: { label: 'Maximum', sql: 'MAX' },
};

const OPERATORS = {
  '=': '=', '!=': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
};

const MAX_DIMENSIONS = 5;
const MAX_METRICS = 5;
const MAX_FILTERS = 10;
const ROW_LIMIT = 500;

module.exports = { DATA_SOURCES, AGGREGATIONS, OPERATORS, MAX_DIMENSIONS, MAX_METRICS, MAX_FILTERS, ROW_LIMIT };
