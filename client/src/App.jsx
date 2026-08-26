import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Operations from './pages/Operations';
import SalesCrm from './pages/SalesCrm';
import Specialty from './pages/Specialty';
import GovernanceRisk from './pages/GovernanceRisk';
import BusinessIntelligence from './pages/BusinessIntelligence';
import AcademicIntelligence from './pages/AcademicIntelligence';
import Users from './pages/Users';
import Roles from './pages/Roles';
import CompanyProfile from './pages/CompanyProfile';
import Branches from './pages/Branches';
import FinancialYears from './pages/FinancialYears';
import AuditLogs from './pages/AuditLogs';
import BackupRestore from './pages/BackupRestore';
import AccessControl from './pages/AccessControl';
import ThemeSettings from './pages/ThemeSettings';
import Products from './pages/Products';
import Catalog from './pages/Catalog';
import InventoryWarehouses from './pages/InventoryWarehouses';
import StockOperations from './pages/StockOperations';
import Transfers from './pages/Transfers';
import InventoryCounts from './pages/InventoryCounts';
import InventoryReports from './pages/InventoryReports';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import AccountingWorkspace from './pages/AccountingWorkspace';
import Quotations from './pages/Quotations';
import SalesOrders from './pages/SalesOrders';
import Deliveries from './pages/Deliveries';
import Invoices from './pages/Invoices';
import RecurringInvoices from './pages/RecurringInvoices';
import Payments from './pages/Payments';
import Returns from './pages/Returns';
import SalesReports from './pages/SalesReports';
import ChartOfAccounts from './pages/ChartOfAccounts';
import CurrencySettings from './pages/CurrencySettings';
import JournalEntries from './pages/JournalEntries';
import GeneralLedger from './pages/GeneralLedger';
import FinancialStatements from './pages/FinancialStatements';
import TaxReports from './pages/TaxReports';
import HRReport from './pages/HRReport';
import DepartmentalReports from './pages/DepartmentalReports';
import ManagementAccountReport from './pages/ManagementAccountReport';
import Banking from './pages/Banking';
import BankReconciliationStatement from './pages/BankReconciliationStatement';
import PettyCash from './pages/PettyCash';
import Budgets from './pages/Budgets';
import ProcurementBudget from './pages/ProcurementBudget';
import SalesBudget from './pages/SalesBudget';
import Income from './pages/Income';
import Expenses from './pages/Expenses';
import ProcurementWorkspace from './pages/ProcurementWorkspace';
import HRWorkspace from './pages/HRWorkspace';
import InventoryWorkspace from './pages/InventoryWorkspace';
import SalesWorkspace from './pages/SalesWorkspace';
import Suppliers from './pages/Suppliers';
import ProcurementSettings from './pages/ProcurementSettings';
import Requisitions from './pages/Requisitions';
import Rfqs from './pages/Rfqs';
import PurchaseOrders from './pages/PurchaseOrders';
import Grns from './pages/Grns';
import PurchaseInvoices from './pages/PurchaseInvoices';
import SupplierPayments from './pages/SupplierPayments';
import CommunicationCentre from './pages/CommunicationCentre';
import HRPayroll from './pages/HRPayroll';
import OrgStructure from './pages/OrgStructure';
import Recruitment from './pages/Recruitment';
import MyWorkspace from './pages/MyWorkspace';
import Compliance from './pages/Compliance';
import Learning from './pages/Learning';
import Performance from './pages/Performance';
import Leads from './pages/Leads';
import CRMWorkspace from './pages/CRMWorkspace';
import SupplierManagement from './pages/SupplierManagement';
import AssetManagement from './pages/AssetManagement';
import Manufacturing from './pages/Manufacturing';
import ManufacturingWorkspace from './pages/ManufacturingWorkspace';
import ManufacturingSettings from './pages/ManufacturingSettings';
import InventorySettings from './pages/InventorySettings';
import HRPayrollSettings from './pages/HRPayrollSettings';
import BusinessContinuity from './pages/BusinessContinuity';
import BCMWorkspace from './pages/BCMWorkspace';
import ComplianceCalendar from './pages/ComplianceCalendar';
import Services from './pages/Services';
import ServicesWorkspace from './pages/ServicesWorkspace';
import SchoolManagement from './pages/SchoolManagement';
import AccountingLauncher from './pages/AccountingLauncher';
import ModuleLauncher from './pages/ModuleLauncher';
import SchoolWorkspace from './pages/SchoolWorkspace';
import Rental from './pages/Rental';
import RentalWorkspace from './pages/RentalWorkspace';
import ApprovalWorkflows from './pages/ApprovalWorkflows';
import Tasks from './pages/Tasks';
import Calendar from './pages/Calendar';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/register" element={<Register />} />

      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/dashboards/operations" element={<ProtectedRoute><Operations /></ProtectedRoute>} />
      <Route path="/dashboards/sales-crm" element={<ProtectedRoute><SalesCrm /></ProtectedRoute>} />
      <Route path="/dashboards/specialty" element={<ProtectedRoute><Specialty /></ProtectedRoute>} />
      <Route path="/dashboards/governance" element={<ProtectedRoute><GovernanceRisk /></ProtectedRoute>} />
      <Route path="/business-intelligence" element={<ProtectedRoute><BusinessIntelligence /></ProtectedRoute>} />
      <Route path="/school/academic-intelligence" element={<ProtectedRoute requirePermission="school.view"><AcademicIntelligence /></ProtectedRoute>} />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute requirePermission="system.users.manage">
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/roles"
        element={
          <ProtectedRoute requirePermission="system.roles.manage">
            <Roles />
          </ProtectedRoute>
        }
      />
      <Route path="/admin/company" element={<ProtectedRoute><CompanyProfile /></ProtectedRoute>} />
      <Route path="/admin/branches" element={<ProtectedRoute><Branches /></ProtectedRoute>} />
      <Route
        path="/admin/financial-years"
        element={
          <ProtectedRoute requirePermission="system.financial_periods.manage">
            <FinancialYears />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <ProtectedRoute requirePermission="system.audit.view">
            <AuditLogs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/backup-restore"
        element={
          <ProtectedRoute requirePermission="system.backup.manage">
            <BackupRestore />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/access-control"
        element={
          <ProtectedRoute requirePermission="system.access_control.manage">
            <AccessControl />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/theme"
        element={
          <ProtectedRoute>
            <ThemeSettings />
          </ProtectedRoute>
        }
      />

      <Route path="/inventory/workspace" element={<ProtectedRoute><InventoryWorkspace /></ProtectedRoute>} />
      <Route path="/inventory/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
      <Route
        path="/inventory/catalog"
        element={
          <ProtectedRoute requirePermission="inventory.products.manage">
            <Catalog />
          </ProtectedRoute>
        }
      />
      <Route path="/inventory/warehouses" element={<ProtectedRoute><InventoryWarehouses /></ProtectedRoute>} />
      <Route path="/inventory/stock" element={<ProtectedRoute><StockOperations /></ProtectedRoute>} />
      <Route
        path="/inventory/transfers"
        element={
          <ProtectedRoute requirePermission="inventory.transfers.manage">
            <Transfers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory/counts"
        element={
          <ProtectedRoute requirePermission="inventory.counts.manage">
            <InventoryCounts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory/reports"
        element={
          <ProtectedRoute requirePermission="inventory.reports.view">
            <InventoryReports />
          </ProtectedRoute>
        }
      />

      <Route path="/sales/workspace" element={<ProtectedRoute><SalesWorkspace /></ProtectedRoute>} />

      <Route path="/sales/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/sales/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
      <Route
        path="/sales/quotations"
        element={<ProtectedRoute requirePermission="sales.quotations.manage"><Quotations /></ProtectedRoute>}
      />
      <Route
        path="/sales/orders"
        element={<ProtectedRoute requirePermission="sales.orders.manage"><SalesOrders /></ProtectedRoute>}
      />
      <Route
        path="/sales/deliveries"
        element={<ProtectedRoute requirePermission="sales.deliveries.manage"><Deliveries /></ProtectedRoute>}
      />
      <Route
        path="/sales/invoices"
        element={<ProtectedRoute requirePermission="sales.invoices.manage"><Invoices /></ProtectedRoute>}
      />
      <Route
        path="/sales/recurring-invoices"
        element={<ProtectedRoute requirePermission="sales.recurring_invoices.manage"><RecurringInvoices /></ProtectedRoute>}
      />
      <Route
        path="/sales/payments"
        element={<ProtectedRoute requirePermission="sales.payments.manage"><Payments /></ProtectedRoute>}
      />
      <Route
        path="/sales/returns"
        element={<ProtectedRoute requirePermission="sales.returns.manage"><Returns /></ProtectedRoute>}
      />
      <Route
        path="/sales/reports"
        element={<ProtectedRoute requirePermission="sales.reports.view"><SalesReports /></ProtectedRoute>}
      />

      <Route path="/accounting" element={<ProtectedRoute><AccountingLauncher /></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute><ModuleLauncher sectionName="Sales & Distribution" /></ProtectedRoute>} />
      <Route path="/procurement" element={<ProtectedRoute><ModuleLauncher sectionName="Procurement & Purchasing" /></ProtectedRoute>} />
      <Route path="/manufacturing/menu" element={<ProtectedRoute><ModuleLauncher sectionName="Manufacturing" /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><ModuleLauncher sectionName="Inventory & Warehouse" /></ProtectedRoute>} />
      <Route path="/hr" element={<ProtectedRoute><ModuleLauncher sectionName="HR & Payroll" /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ModuleLauncher sectionName="Reports" /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><ModuleLauncher sectionName="Settings" /></ProtectedRoute>} />
      <Route path="/accounting/workspace" element={<ProtectedRoute><AccountingWorkspace /></ProtectedRoute>} />

      <Route
        path="/accounting/chart-of-accounts"
        element={<ProtectedRoute requirePermission="accounting.coa.manage"><ChartOfAccounts /></ProtectedRoute>}
      />
      <Route
        path="/accounting/currencies"
        element={<ProtectedRoute requirePermission="accounting.coa.manage"><CurrencySettings /></ProtectedRoute>}
      />
      <Route
        path="/accounting/journal"
        element={<ProtectedRoute requirePermission="accounting.journal.manage"><JournalEntries /></ProtectedRoute>}
      />
      <Route
        path="/accounting/ledger"
        element={<ProtectedRoute requirePermission="accounting.ledger.view"><GeneralLedger /></ProtectedRoute>}
      />
      <Route
        path="/accounting/statements"
        element={<ProtectedRoute requirePermission="accounting.ledger.view"><FinancialStatements /></ProtectedRoute>}
      />
      <Route
        path="/reports/tax"
        element={<ProtectedRoute requirePermission="accounting.tax_reports.view"><TaxReports /></ProtectedRoute>}
      />
      <Route
        path="/reports/hr"
        element={<ProtectedRoute requirePermission="hr.reports.view"><HRReport /></ProtectedRoute>}
      />
      <Route
        path="/reports/departmental"
        element={<ProtectedRoute requirePermission="hr.reports.view"><DepartmentalReports /></ProtectedRoute>}
      />
      <Route
        path="/reports/management-accounts"
        element={<ProtectedRoute requirePermission="accounting.management_reports.view"><ManagementAccountReport /></ProtectedRoute>}
      />
      <Route
        path="/accounting/banking"
        element={<ProtectedRoute requirePermission="accounting.banking.manage"><Banking /></ProtectedRoute>}
      />
      <Route
        path="/accounting/banking/:id/reconciliation-statement"
        element={<ProtectedRoute requirePermission="accounting.banking.manage"><BankReconciliationStatement /></ProtectedRoute>}
      />
      <Route
        path="/accounting/petty-cash"
        element={<ProtectedRoute requirePermission="accounting.petty_cash.manage"><PettyCash /></ProtectedRoute>}
      />
      <Route
        path="/accounting/budgets"
        element={<ProtectedRoute requirePermission="accounting.budgets.manage"><Budgets /></ProtectedRoute>}
      />
      <Route
        path="/procurement/budget"
        element={<ProtectedRoute requirePermission="procurement.budget.manage"><ProcurementBudget /></ProtectedRoute>}
      />
      <Route
        path="/sales/budget"
        element={<ProtectedRoute requirePermission="sales.budget.manage"><SalesBudget /></ProtectedRoute>}
      />
      <Route
        path="/accounting/income"
        element={<ProtectedRoute requirePermission="accounting.income.manage"><Income /></ProtectedRoute>}
      />
      <Route
        path="/accounting/expenses"
        element={<ProtectedRoute requirePermission="accounting.expenses.manage"><Expenses /></ProtectedRoute>}
      />

      <Route path="/procurement/workspace" element={<ProtectedRoute><ProcurementWorkspace /></ProtectedRoute>} />

      <Route
        path="/procurement/settings"
        element={<ProtectedRoute requirePermission="procurement.settings.manage"><ProcurementSettings /></ProtectedRoute>}
      />
      <Route
        path="/procurement/suppliers"
        element={<ProtectedRoute requirePermission="procurement.suppliers.manage"><Suppliers /></ProtectedRoute>}
      />
      <Route
        path="/procurement/requisitions"
        element={<ProtectedRoute requirePermission="procurement.requisitions.manage"><Requisitions /></ProtectedRoute>}
      />
      <Route
        path="/procurement/rfqs"
        element={<ProtectedRoute requirePermission="procurement.rfq.manage"><Rfqs /></ProtectedRoute>}
      />
      <Route
        path="/procurement/purchase-orders"
        element={<ProtectedRoute requirePermission="procurement.orders.manage"><PurchaseOrders /></ProtectedRoute>}
      />
      <Route
        path="/procurement/grns"
        element={<ProtectedRoute requirePermission="procurement.receiving.manage"><Grns /></ProtectedRoute>}
      />
      <Route
        path="/procurement/purchase-invoices"
        element={<ProtectedRoute requirePermission="procurement.invoices.manage"><PurchaseInvoices /></ProtectedRoute>}
      />
      <Route
        path="/procurement/supplier-payments"
        element={<ProtectedRoute requirePermission="procurement.payments.manage"><SupplierPayments /></ProtectedRoute>}
      />

      <Route path="/communications" element={<ProtectedRoute><CommunicationCentre /></ProtectedRoute>} />

      <Route path="/crm/workspace" element={<ProtectedRoute><CRMWorkspace /></ProtectedRoute>} />
      <Route path="/crm/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />

      <Route path="/hr/workspace" element={<ProtectedRoute><HRWorkspace /></ProtectedRoute>} />

      <Route
        path="/hr/payroll"
        element={<ProtectedRoute><HRPayroll /></ProtectedRoute>}
      />
      <Route path="/hr/organization-structure" element={<ProtectedRoute><OrgStructure /></ProtectedRoute>} />
      <Route
        path="/hr/recruitment"
        element={<ProtectedRoute requirePermission="hr.recruitment.manage"><Recruitment /></ProtectedRoute>}
      />
      <Route path="/my-workspace" element={<ProtectedRoute><MyWorkspace /></ProtectedRoute>} />
      <Route path="/hr/compliance" element={<ProtectedRoute><Compliance /></ProtectedRoute>} />
      <Route
        path="/hr/learning"
        element={<ProtectedRoute><Learning /></ProtectedRoute>}
      />
      <Route
        path="/hr/performance"
        element={<ProtectedRoute><Performance /></ProtectedRoute>}
      />
      <Route
        path="/procurement/supplier-management"
        element={<ProtectedRoute requirePermission="procurement.suppliers.manage"><SupplierManagement /></ProtectedRoute>}
      />
      <Route
        path="/assets"
        element={<ProtectedRoute requirePermission="assets.register.manage"><AssetManagement /></ProtectedRoute>}
      />
      <Route
        path="/manufacturing/workspace"
        element={<ProtectedRoute><ManufacturingWorkspace /></ProtectedRoute>}
      />
      <Route
        path="/manufacturing"
        element={<ProtectedRoute requirePermission="manufacturing.work_orders.manage"><Manufacturing /></ProtectedRoute>}
      />
      <Route
        path="/manufacturing/settings"
        element={<ProtectedRoute requirePermission="manufacturing.settings.manage"><ManufacturingSettings /></ProtectedRoute>}
      />
      <Route
        path="/inventory/settings"
        element={<ProtectedRoute requirePermission="inventory.settings.manage"><InventorySettings /></ProtectedRoute>}
      />
      <Route
        path="/hr/settings"
        element={<ProtectedRoute requirePermission="hr.settings.manage"><HRPayrollSettings /></ProtectedRoute>}
      />
      <Route
        path="/bcm/workspace"
        element={<ProtectedRoute><BCMWorkspace /></ProtectedRoute>}
      />
      <Route
        path="/bcm"
        element={<ProtectedRoute requirePermission="bcm.view"><BusinessContinuity /></ProtectedRoute>}
      />
      <Route
        path="/compliance-calendar"
        element={<ProtectedRoute requirePermission="system.compliance.manage"><ComplianceCalendar /></ProtectedRoute>}
      />
      <Route
        path="/services/workspace"
        element={<ProtectedRoute><ServicesWorkspace /></ProtectedRoute>}
      />
      <Route
        path="/services"
        element={<ProtectedRoute requirePermission="services.view"><Services /></ProtectedRoute>}
      />
      <Route
        path="/school/workspace"
        element={<ProtectedRoute><SchoolWorkspace /></ProtectedRoute>}
      />
      <Route
        path="/school"
        element={<ProtectedRoute requirePermission="school.view"><SchoolManagement /></ProtectedRoute>}
      />
      <Route
        path="/rental/workspace"
        element={<ProtectedRoute><RentalWorkspace /></ProtectedRoute>}
      />
      <Route
        path="/rental"
        element={<ProtectedRoute requirePermission="rental.agreements.manage"><Rental /></ProtectedRoute>}
      />
      <Route path="/workflows" element={<ProtectedRoute><ApprovalWorkflows /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
    </Routes>
  );
}
