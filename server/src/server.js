require('dotenv').config();

console.log('DATABASE_URL loaded?', !!process.env.DATABASE_URL);
console.log('DATABASE_URL starts with:', process.env.DATABASE_URL?.substring(0, 40));

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const companyRoutes = require('./routes/companyRoutes');
const financialPeriodRoutes = require('./routes/financialPeriodRoutes');
const auditRoutes = require('./routes/auditRoutes');
const meRoutes = require('./routes/meRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const productRoutes = require('./routes/productRoutes');
const stockRoutes = require('./routes/stockRoutes');
const transferRoutes = require('./routes/transferRoutes');
const inventoryCountRoutes = require('./routes/inventoryCountRoutes');
const inventoryReportRoutes = require('./routes/inventoryReportRoutes');
const customerRoutes = require('./routes/customerRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const salesOrderRoutes = require('./routes/salesOrderRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const recurringInvoiceRoutes = require('./routes/recurringInvoiceRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const returnRoutes = require('./routes/returnRoutes');
const salesReportRoutes = require('./routes/salesReportRoutes');
const chartOfAccountsRoutes = require('./routes/chartOfAccountsRoutes');
const journalRoutes = require('./routes/journalRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const openingBalanceRoutes = require('./routes/openingBalanceRoutes');
const bankRoutes = require('./routes/bankRoutes');
const pettyCashRoutes = require('./routes/pettyCashRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const financialStatementRoutes = require('./routes/financialStatementRoutes');
const taxReportRoutes = require('./routes/taxReportRoutes');
const currencyRoutes = require('./routes/currencyRoutes');
const closingRoutes = require('./routes/closingRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const procurementSettingsRoutes = require('./routes/procurementSettingsRoutes');
const backupRoutes = require('./routes/backupRoutes');
const statutoryComplianceRoutes = require('./routes/statutoryComplianceRoutes');
const manufacturingRoutes = require('./routes/manufacturingRoutes');
const rentalRoutes = require('./routes/rentalRoutes');
const bcmRoutes = require('./routes/bcmRoutes');
const complianceCalendarRoutes = require('./routes/complianceCalendarRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const requisitionRoutes = require('./routes/requisitionRoutes');
const rfqRoutes = require('./routes/rfqRoutes');
const purchaseOrderRoutes = require('./routes/purchaseOrderRoutes');
const grnRoutes = require('./routes/grnRoutes');
const purchaseInvoiceRoutes = require('./routes/purchaseInvoiceRoutes');
const supplierPaymentRoutes = require('./routes/supplierPaymentRoutes');
const purchaseReturnRoutes = require('./routes/purchaseReturnRoutes');
const contractRoutes = require('./routes/contractRoutes');
const procurementReportRoutes = require('./routes/procurementReportRoutes');
const communicationRoutes = require('./routes/communicationRoutes');
const crmRoutes = require('./routes/crmRoutes');
const hrPayrollRoutes = require('./routes/hrPayrollRoutes');
const hrReportRoutes = require('./routes/hrReportRoutes');
const supplierContactRoutes = require('./routes/supplierContactRoutes');
const supplierCommunicationRoutes = require('./routes/supplierCommunicationRoutes');
const assetRoutes = require('./routes/assetRoutes');
const approvalWorkflowRoutes = require('./routes/approvalWorkflowRoutes');
const taskRoutes = require('./routes/taskRoutes');
const calendarEventRoutes = require('./routes/calendarEventRoutes');
const attachmentRoutes = require('./routes/attachmentRoutes');
const recruitmentRoutes = require('./routes/recruitmentRoutes');
const learningRoutes = require('./routes/learningRoutes');
const performanceRoutes = require('./routes/performanceRoutes');
const essRoutes = require('./routes/essRoutes');
const complianceRoutes = require('./routes/complianceRoutes');
const operationsRoutes = require('./routes/operationsRoutes');
const salesCrmRoutes = require('./routes/salesCrmRoutes');
const specialtyRoutes = require('./routes/specialtyRoutes');
const governanceRoutes = require('./routes/governanceRoutes');
const biRoutes = require('./routes/biRoutes');
const issuesRoutes = require('./routes/issuesRoutes');
const academicIntelligenceRoutes = require('./routes/academicIntelligenceRoutes');
const accessControlRoutes = require('./routes/accessControlRoutes');
const errorHandler = require('./middleware/errorHandler');
const { startBackgroundScanner } = require('./services/notificationService');
const { startRecurringInvoiceScheduler } = require('./services/recurringInvoiceService');
const { startPayrollAutoRunScheduler } = require('./services/payrollAutoRunService');
const { startPromotionScheduler } = require('./services/promotionSchedulerService');

const app = express();

// Without this, req.ip is the direct TCP connection's address — behind
// any real reverse-proxy hosting (a load balancer, Render, DigitalOcean)
// that's the proxy's own internal IP, not the real visitor's, silently
// breaking both the existing session/audit IP logging and IP allowlist
// login restriction. Trusting exactly one hop, not `true` (which trusts
// every hop in the chain and would let a client spoof X-Forwarded-For
// directly if there's no actual proxy in front), matches the standard
// single-reverse-proxy shape this app is meant to run behind.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// A general safety net for every endpoint under /api — previously only
// /auth/login had any rate limiting at all, meaning the other ~400
// business endpoints across the whole app had none. Kept deliberately
// generous (1000 requests / 15 min per IP) rather than tight, since this
// is a B2B app where an entire office can share one public IP behind NAT
// — a strict limit here would risk locking out multiple legitimate
// simultaneous users, not just an attacker. Auth-sensitive endpoints
// (registration, password reset, MFA) get their own much tighter limits
// directly in authRoutes.js, since those aren't the kind of action many
// people in one office do at once.
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', roleRoutes);          // /api/roles, /api/permissions
app.use('/api', companyRoutes);       // /api/company, /api/branches
app.use('/api', financialPeriodRoutes); // /api/financial-years, /api/fiscal-periods
app.use('/api', auditRoutes);         // /api/audit-logs, /api/activity-logs
app.use('/api', meRoutes);            // /api/me
app.use('/api', catalogRoutes);       // /api/uom, /api/brands, /api/product-categories
app.use('/api', warehouseRoutes);     // /api/warehouses
app.use('/api', productRoutes);       // /api/products
app.use('/api', stockRoutes);         // /api/stock/in, /out, /adjust, /damage, /movements
app.use('/api', transferRoutes);      // /api/transfers
app.use('/api', inventoryCountRoutes); // /api/inventory-counts
app.use('/api', inventoryReportRoutes); // /api/inventory-reports/*
app.use('/api', customerRoutes);       // /api/customers
app.use('/api', quotationRoutes);      // /api/quotations
app.use('/api', salesOrderRoutes);     // /api/sales-orders
app.use('/api', deliveryRoutes);       // /api/deliveries
app.use('/api', invoiceRoutes);        // /api/invoices
app.use('/api', recurringInvoiceRoutes); // /api/recurring-invoices
app.use('/api', paymentRoutes);        // /api/payments
app.use('/api', returnRoutes);         // /api/returns, /api/credit-notes
app.use('/api', salesReportRoutes);    // /api/sales-reports/*
app.use('/api', chartOfAccountsRoutes); // /api/chart-of-accounts, /api/gl-mappings
app.use('/api', journalRoutes);        // /api/journal-entries
app.use('/api', ledgerRoutes);         // /api/ledger/:accountId, /api/trial-balance
app.use('/api', openingBalanceRoutes); // /api/opening-balances
app.use('/api', bankRoutes);           // /api/bank-accounts, /api/bank-statement-lines
app.use('/api', pettyCashRoutes);      // /api/petty-cash-accounts
app.use('/api', incomeRoutes);         // /api/income-entries
app.use('/api', expenseRoutes);        // /api/expense-entries
app.use('/api', budgetRoutes);         // /api/budgets
app.use('/api', financialStatementRoutes); // /api/financial-statements/*
app.use('/api', taxReportRoutes);          // /api/tax-reports/*
app.use('/api', currencyRoutes);           // /api/currencies, /api/exchange-rates
app.use('/api', closingRoutes);        // /api/accounting/fiscal-periods/:id/close, /api/accounting/year-end-close
app.use('/api', supplierRoutes);       // /api/suppliers
app.use('/api', procurementSettingsRoutes); // /api/procurement/settings
app.use('/api', backupRoutes);              // /api/settings/backup, /api/settings/restore
app.use('/api', accessControlRoutes);       // /api/access-control/sessions, /api/access-control/ip-rules
app.use('/api', statutoryComplianceRoutes); // /api/statutory-compliance-status, /api/statutory-compliance-items/:id
app.use('/api', manufacturingRoutes);       // /api/manufacturing/*
app.use('/api', rentalRoutes);              // /api/rental/*
app.use('/api', bcmRoutes);                 // /api/bcm/*
app.use('/api', complianceCalendarRoutes);   // /api/compliance-calendar/*
app.use('/api', serviceRoutes);              // /api/services/*
app.use('/api', schoolRoutes);               // /api/school/*
app.use('/api', requisitionRoutes);    // /api/requisitions
app.use('/api', rfqRoutes);            // /api/rfqs, /api/supplier-quotations
app.use('/api', purchaseOrderRoutes);  // /api/purchase-orders
app.use('/api', grnRoutes);            // /api/grns
app.use('/api', purchaseInvoiceRoutes); // /api/purchase-invoices
app.use('/api', supplierPaymentRoutes); // /api/supplier-payments
app.use('/api', purchaseReturnRoutes); // /api/purchase-returns, /api/debit-notes
app.use('/api', contractRoutes);       // /api/contracts
app.use('/api', procurementReportRoutes); // /api/procurement-reports/*
app.use('/api', communicationRoutes);     // /api/notifications, /api/communication-logs, /api/announcements
app.use('/api', crmRoutes);                // /api/leads, /api/contacts, /api/activities
app.use('/api', hrPayrollRoutes);         // /api/employees, /api/leave-requests, /api/payroll-runs
app.use('/api', hrReportRoutes);          // /api/hr-reports/headcount-summary, /api/hr-reports/payroll-cost-trend
app.use('/api', supplierContactRoutes);       // /api/suppliers/:id/contacts
app.use('/api', supplierCommunicationRoutes); // /api/suppliers/:id/communications
app.use('/api', assetRoutes);                 // /api/asset-categories, /api/fixed-assets, /api/asset-reports/*
app.use('/api', approvalWorkflowRoutes);      // /api/workflow-definitions, /api/workflow-instances
app.use('/api', taskRoutes);                  // /api/tasks
app.use('/api', calendarEventRoutes);          // /api/calendar-events
app.use('/api', attachmentRoutes);             // /api/attachments
app.use('/api', recruitmentRoutes);            // /api/job-postings, /api/candidates
app.use('/api', learningRoutes);               // /api/training-courses, /api/training-sessions
app.use('/api', performanceRoutes);            // /api/kpis, /api/performance-cycles
app.use('/api', essRoutes);                    // /api/me/*, /api/timesheets, /api/loans
app.use('/api', complianceRoutes);             // /api/compliance-documents, /api/company-policies
app.use('/api', operationsRoutes);             // /api/operations/manufacturing-summary, /api/operations/ai-insights
app.use('/api', salesCrmRoutes);               // /api/sales-crm/pipeline-summary, /api/sales-crm/ai-insights
app.use('/api', specialtyRoutes);              // /api/specialty/ai-insights
app.use('/api', governanceRoutes);             // /api/governance/ai-insights
app.use('/api', biRoutes);                     // /api/bi/data-sources, /api/bi/run, /api/bi/saved-reports
app.use('/api', issuesRoutes);                 // /api/issues/explain
app.use('/api', academicIntelligenceRoutes);   // /api/school/academic-insights

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Bizness-OS API listening on port ${PORT}`);
  startBackgroundScanner();
  startRecurringInvoiceScheduler();
  startPayrollAutoRunScheduler();
  startPromotionScheduler();
});

module.exports = app;
