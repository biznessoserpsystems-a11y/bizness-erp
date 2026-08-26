import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import {
  IconAcctWorkspace, IconAcctChartOfAccounts, IconAcctJournal, IconAcctLedger, IconAcctBanking,
  IconAcctPettyCash, IconAcctBudgets, IconAcctAssets, IconAcctIncome, IconAcctExpenses, IconAcctPayment,
} from '../components/icons';

// Mirrors the same sub-items already defined in navConfig.js for
// Accounting & Finance — each tile is a real, already-existing route, not
// an internal tab, so clicking one genuinely navigates to that page
// rather than switching a view in place.
const TILES = [
  { label: 'Workspace', to: '/accounting/workspace', permission: 'accounting.ledger.view', icon: IconAcctWorkspace, color: '#0B6E4F', bg: '#E7F5EF' },
  { label: 'Chart of Accounts', to: '/accounting/chart-of-accounts', permission: 'accounting.coa.manage', icon: IconAcctChartOfAccounts, color: '#3D6B99', bg: '#E8F0F7' },
  { label: 'Journal Entries', to: '/accounting/journal', permission: 'accounting.journal.manage', icon: IconAcctJournal, color: '#6B4FA0', bg: '#F1EBF8' },
  { label: 'General Ledger', to: '/accounting/ledger', permission: 'accounting.ledger.view', icon: IconAcctLedger, color: '#B9790A', bg: '#FBF1DE' },
  { label: 'Banking', to: '/accounting/banking', permission: 'accounting.banking.manage', icon: IconAcctBanking, color: '#2B6CB0', bg: '#EAF1F8' },
  { label: 'Petty Cash', to: '/accounting/petty-cash', permission: 'accounting.petty_cash.manage', icon: IconAcctPettyCash, color: '#C9971F', bg: '#FBF3DF' },
  { label: 'Budgets', to: '/accounting/budgets', permission: 'accounting.budgets.manage', icon: IconAcctBudgets, color: '#1E7A6E', bg: '#E6F3F1' },
  { label: 'Assets', to: '/assets', permission: 'assets.register.manage', icon: IconAcctAssets, color: '#8A6A2F', bg: '#F5EEDF' },
  { label: 'Income', to: '/accounting/income', permission: 'accounting.income.manage', icon: IconAcctIncome, color: '#2F9E6E', bg: '#EAF6EF' },
  { label: 'Expenses', to: '/accounting/expenses', permission: 'accounting.expenses.manage', icon: IconAcctExpenses, color: '#A8425C', bg: '#F7E9ED' },
  { label: 'Payment', to: '/procurement/supplier-payments', permission: 'procurement.payments.manage', icon: IconAcctPayment, color: '#A0522D', bg: '#F5E9E1' },
];

export default function AccountingLauncher() {
  const { hasPermission } = useAuth();
  const visibleTiles = TILES.filter((t) => !t.permission || hasPermission(t.permission));

  return (
    <DashboardLayout title="Accounting & Finance">
      {visibleTiles.length === 0 ? (
        <div className="card"><p>You don't have access to any Accounting & Finance pages.</p></div>
      ) : (
        <div className="module-launcher-grid">
          {visibleTiles.map((t) => {
            const TileIcon = t.icon;
            return (
              <Link key={t.to} to={t.to} className="module-tile" style={{ '--tile-color': t.color, '--tile-bg': t.bg }}>
                <span className="module-tile-icon"><TileIcon /></span>
                <span className="module-tile-label">{t.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
