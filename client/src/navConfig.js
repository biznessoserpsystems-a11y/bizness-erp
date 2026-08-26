import {
  IconDashboard, IconInventory, IconCRM, IconSales, IconFinance,
  IconProcurement, IconHR, IconWorkflow, IconTasks, IconReports, IconSettings, IconManufacturing, IconRental, IconBCM, IconServices, IconSchool,
} from './components/icons';

// Modules that are actually implemented so far link somewhere real.
// Everything else is shown (matching the full system blueprint) but disabled,
// so the nav communicates the eventual shape of the product.
export const NAV = [
  {
    section: 'Overview',
    icon: IconDashboard,
    items: [
      { label: 'Executive Dashboard', to: '/', enabled: true },
      { label: 'Operations Dashboard', to: '/dashboards/operations', enabled: true },
      { label: 'Sales & CRM Dashboard', to: '/dashboards/sales-crm', enabled: true },
      { label: 'Specialty Businesses Dashboard', to: '/dashboards/specialty', enabled: true },
      { label: 'Governance & Risk Dashboard', to: '/dashboards/governance', enabled: true },
      { label: 'Business Intelligence', to: '/business-intelligence', enabled: true },
    ],
  },
  {
    section: 'My Workspace',
    icon: IconHR,
    items: [{ label: 'My Workspace', to: '/my-workspace', enabled: true }],
  },
  {
    section: 'Accounting & Finance',
    icon: IconFinance,
    launcherPath: '/accounting',
    items: [
      { label: 'Workspace', to: '/accounting/workspace', enabled: true, permission: 'accounting.ledger.view' },
      { label: 'Chart of Accounts', to: '/accounting/chart-of-accounts', enabled: true, permission: 'accounting.coa.manage' },
      { label: 'Journal Entries', to: '/accounting/journal', enabled: true, permission: 'accounting.journal.manage' },
      { label: 'General Ledger', to: '/accounting/ledger', enabled: true, permission: 'accounting.ledger.view' },
      { label: 'Banking', to: '/accounting/banking', enabled: true, permission: 'accounting.banking.manage' },
      { label: 'Petty Cash', to: '/accounting/petty-cash', enabled: true, permission: 'accounting.petty_cash.manage' },
      { label: 'Budgets', to: '/accounting/budgets', enabled: true, permission: 'accounting.budgets.manage' },
      { label: 'Assets', to: '/assets', enabled: true, permission: 'assets.register.manage' },
      { label: 'Income', to: '/accounting/income', enabled: true, permission: 'accounting.income.manage' },
      { label: 'Expenses', to: '/accounting/expenses', enabled: true, permission: 'accounting.expenses.manage' },
      { label: 'Payment', to: '/procurement/supplier-payments', enabled: true, permission: 'procurement.payments.manage' },
    ],
  },
  {
    section: 'Sales & Distribution',
    icon: IconSales,
    launcherPath: '/sales',
    items: [
      { label: 'Workspace', to: '/sales/workspace', enabled: true },
      { label: 'Customers', to: '/sales/customers', enabled: true },
      { label: 'Quotations', to: '/sales/quotations', enabled: true, permission: 'sales.quotations.manage' },
      { label: 'Sales Orders', to: '/sales/orders', enabled: true, permission: 'sales.orders.manage' },
      { label: 'Deliveries', to: '/sales/deliveries', enabled: true, permission: 'sales.deliveries.manage' },
      { label: 'Invoices', to: '/sales/invoices', enabled: true, permission: 'sales.invoices.manage' },
      { label: 'Recurring Invoices', to: '/sales/recurring-invoices', enabled: true, permission: 'sales.recurring_invoices.manage' },
      { label: 'Payments', to: '/sales/payments', enabled: true, permission: 'sales.payments.manage' },
      { label: 'Returns & Credit Notes', to: '/sales/returns', enabled: true, permission: 'sales.returns.manage' },
      { label: 'Budget', to: '/sales/budget', enabled: true, permission: 'sales.budget.manage' },
    ],
  },
  {
    section: 'Procurement & Purchasing',
    icon: IconProcurement,
    launcherPath: '/procurement',
    items: [
      { label: 'Workspace', to: '/procurement/workspace', enabled: true },
      { label: 'Suppliers', to: '/procurement/suppliers', enabled: true, permission: 'procurement.suppliers.manage' },
      { label: 'Supplier Management', to: '/procurement/supplier-management', enabled: true, permission: 'procurement.suppliers.manage' },
      { label: 'Requisitions', to: '/procurement/requisitions', enabled: true, permission: 'procurement.requisitions.manage' },
      { label: 'RFQs', to: '/procurement/rfqs', enabled: true, permission: 'procurement.rfq.manage' },
      { label: 'Purchase Orders', to: '/procurement/purchase-orders', enabled: true, permission: 'procurement.orders.manage' },
      { label: 'Goods Received', to: '/procurement/grns', enabled: true, permission: 'procurement.receiving.manage' },
      { label: 'Purchase Invoices', to: '/procurement/purchase-invoices', enabled: true, permission: 'procurement.invoices.manage' },
      { label: 'Budget', to: '/procurement/budget', enabled: true, permission: 'procurement.budget.manage' },
      { label: 'Settings', to: '/procurement/settings', enabled: true, permission: 'procurement.settings.manage' },
    ],
  },
  {
    section: 'Manufacturing',
    icon: IconManufacturing,
    launcherPath: '/manufacturing/menu',
    items: [
      { label: 'Workspace', to: '/manufacturing/workspace', enabled: true },
      { label: 'Work Orders', to: '/manufacturing', enabled: true, permission: 'manufacturing.work_orders.manage' },
      { label: 'Settings', to: '/manufacturing/settings', enabled: true, permission: 'manufacturing.settings.manage' },
    ],
  },
  {
    section: 'Rental Services',
    icon: IconRental,
    items: [
      { label: 'Workspace', to: '/rental/workspace', enabled: true },
      { label: 'Rental Agreements', to: '/rental', enabled: true, permission: 'rental.agreements.manage' },
    ],
  },
  {
    section: 'Business Continuity',
    icon: IconBCM,
    items: [
      { label: 'Workspace', to: '/bcm/workspace', enabled: true },
      { label: 'Risk & Continuity', to: '/bcm', enabled: true, permission: 'bcm.view' },
    ],
  },
  {
    section: 'Service Business',
    icon: IconServices,
    items: [
      { label: 'Workspace', to: '/services/workspace', enabled: true },
      { label: 'Catalog & Jobs', to: '/services', enabled: true, permission: 'services.view' },
    ],
  },
  {
    section: 'School Management',
    icon: IconSchool,
    items: [
      { label: 'Workspace', to: '/school/workspace', enabled: true },
      { label: 'Students & Admissions', to: '/school', enabled: true, permission: 'school.view' },
    ],
  },
  {
    section: 'Inventory & Warehouse',
    icon: IconInventory,
    launcherPath: '/inventory',
    items: [
      { label: 'Workspace', to: '/inventory/workspace', enabled: true },
      { label: 'Products', to: '/inventory/products', enabled: true },
      { label: 'Catalog (Categories/Brands/UoM)', to: '/inventory/catalog', enabled: true, permission: 'inventory.products.manage' },
      { label: 'Warehouses', to: '/inventory/warehouses', enabled: true },
      { label: 'Stock Operations', to: '/inventory/stock', enabled: true },
      { label: 'Transfers', to: '/inventory/transfers', enabled: true, permission: 'inventory.transfers.manage' },
      { label: 'Inventory Count', to: '/inventory/counts', enabled: true, permission: 'inventory.counts.manage' },
      { label: 'Settings', to: '/inventory/settings', enabled: true, permission: 'inventory.settings.manage' },
    ],
  },
  {
    section: 'HR & Payroll',
    icon: IconHR,
    launcherPath: '/hr',
    items: [
      { label: 'Workspace', to: '/hr/workspace', enabled: true },
      { label: 'Employees, Leave & Payroll', to: '/hr/payroll', enabled: true },
      { label: 'Organization Structure', to: '/hr/organization-structure', enabled: true },
      { label: 'Recruitment & Hiring', to: '/hr/recruitment', enabled: true, permission: 'hr.recruitment.manage' },
      { label: 'Learning & Development', to: '/hr/learning', enabled: true },
      { label: 'Performance Management', to: '/hr/performance', enabled: true },
      { label: 'HR Compliance', to: '/hr/compliance', enabled: true },
      { label: 'Communication Centre', to: '/communications', enabled: true },
      { label: 'Settings', to: '/hr/settings', enabled: true, permission: 'hr.settings.manage' },
    ],
  },
  {
    section: 'Productivity',
    icon: IconTasks,
    items: [
      { label: 'Tasks', to: '/tasks', enabled: true },
      { label: 'Calendar', to: '/calendar', enabled: true },
    ],
  },
  {
    section: 'CRM',
    icon: IconCRM,
    items: [
      { label: 'Workspace', to: '/crm/workspace', enabled: true },
      { label: 'Leads', to: '/crm/leads', enabled: true },
    ],
  },
  {
    section: 'Approval Workflows',
    icon: IconWorkflow,
    items: [{ label: 'Approval Workflows', to: '/workflows', enabled: true }],
  },
  {
    section: 'Reports',
    icon: IconReports,
    launcherPath: '/reports',
    items: [
      { label: 'Financial Statements', to: '/accounting/statements', enabled: true, permission: 'accounting.ledger.view' },
      { label: 'Sales Reports', to: '/sales/reports', enabled: true, permission: 'sales.reports.view' },
      { label: 'Inventory Reports', to: '/inventory/reports', enabled: true, permission: 'inventory.reports.view' },
      { label: 'Tax Reports', to: '/reports/tax', enabled: true, permission: 'accounting.tax_reports.view' },
      { label: 'HR Report', to: '/reports/hr', enabled: true, permission: 'hr.reports.view' },
      { label: 'Departmental Reports', to: '/reports/departmental', enabled: true, permission: 'hr.reports.view' },
      { label: 'Management Account Report', to: '/reports/management-accounts', enabled: true, permission: 'accounting.management_reports.view' },
    ],
  },
  {
    section: 'Settings',
    icon: IconSettings,
    launcherPath: '/settings',
    items: [
      { label: 'Company Profile', to: '/admin/company', enabled: true },
      { label: 'Branches', to: '/admin/branches', enabled: true },
      { label: 'Users', to: '/admin/users', enabled: true, permission: 'system.users.manage' },
      { label: 'Roles & Permissions', to: '/admin/roles', enabled: true, permission: 'system.roles.manage' },
      { label: 'Financial Years', to: '/admin/financial-years', enabled: true, permission: 'system.financial_periods.manage' },
      { label: 'Currencies & Exchange Rates', to: '/accounting/currencies', enabled: true, permission: 'accounting.coa.manage' },
      { label: 'Audit Trail', to: '/admin/audit-logs', enabled: true, permission: 'system.audit.view' },
      { label: 'Backup & Restore', to: '/admin/backup-restore', enabled: true, permission: 'system.backup.manage' },
      { label: 'Access Control', to: '/admin/access-control', enabled: true, permission: 'system.access_control.manage' },
      { label: 'Compliance Calendar', to: '/compliance-calendar', enabled: true, permission: 'system.compliance.manage' },
      { label: 'Theme', to: '/settings/theme', enabled: true },
    ],
  },
];

// Flat list of every enabled nav item, tagged with its section — used by the
// topbar's global quick-jump search.
export function flattenNav() {
  const flat = [];
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.enabled) flat.push({ ...item, section: group.section });
    }
  }
  return flat;
}
