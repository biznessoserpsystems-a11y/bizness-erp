import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import CommunicationLog from '../components/CommunicationLog';
import AttachmentsPanel from '../components/AttachmentsPanel';

function money(n) {
  return `GHS ${Number(n || 0).toFixed(2)}`;
}

// ------------------------------------------------------------------
// Tabs — each is a small, independent component that fetches its own
// data on mount, exactly like the tabs in MyWorkspace.jsx already do.
// ------------------------------------------------------------------

function OverviewTab({ header }) {
  return (
    <table>
      <tbody>
        <tr><td style={{ color: 'var(--color-text-muted)', width: 160 }}>Customer code</td><td>{header.customer_code}</td></tr>
        <tr><td style={{ color: 'var(--color-text-muted)' }}>Type</td><td style={{ textTransform: 'capitalize' }}>{header.type || '—'}</td></tr>
        <tr><td style={{ color: 'var(--color-text-muted)' }}>Phone</td><td>{header.phone || '—'}</td></tr>
        <tr><td style={{ color: 'var(--color-text-muted)' }}>Email</td><td>{header.email || '—'}</td></tr>
        <tr><td style={{ color: 'var(--color-text-muted)' }}>Address</td><td>{header.address || '—'}</td></tr>
        <tr><td style={{ color: 'var(--color-text-muted)' }}>TIN</td><td>{header.tin || '—'}</td></tr>
      </tbody>
    </table>
  );
}

function TransactionsTab({ entityId }) {
  const [ledger, setLedger] = useState(null);

  useEffect(() => {
    api.get(`/customers/${entityId}/ledger`).then(({ data }) => setLedger(data)).catch(() => setLedger(false));
  }, [entityId]);

  if (ledger === null) return <p>Loading...</p>;
  if (ledger === false) return <p style={{ color: 'var(--color-text-muted)' }}>Couldn't load transactions.</p>;

  return (
    <>
      <h2>Invoices</h2>
      {ledger.invoices.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No invoices yet.</p> : (
        <table style={{ marginBottom: 20 }}>
          <thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            {ledger.invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.invoice_no}</td>
                <td>{new Date(inv.invoice_date).toLocaleDateString()}</td>
                <td>{new Date(inv.due_date).toLocaleDateString()}</td>
                <td>{money(inv.total_amount)}</td>
                <td>{money(inv.balance)}</td>
                <td><span className="badge badge-neutral">{inv.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Payments</h2>
      {ledger.payments.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No payments yet.</p> : (
        <table style={{ marginBottom: 20 }}>
          <thead><tr><th>Payment</th><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
          <tbody>
            {ledger.payments.map((p) => (
              <tr key={p.id}>
                <td>{p.payment_no}</td>
                <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                <td>{money(p.amount)}</td>
                <td>{p.payment_method || '—'}</td>
                <td>{p.reference || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Credit notes</h2>
      {ledger.creditNotes.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No credit notes.</p> : (
        <table>
          <thead><tr><th>Credit note</th><th>Date</th><th>Amount</th><th>Unapplied</th><th>Status</th></tr></thead>
          <tbody>
            {ledger.creditNotes.map((c) => (
              <tr key={c.id}>
                <td>{c.credit_note_no}</td>
                <td>{new Date(c.credit_note_date).toLocaleDateString()}</td>
                <td>{money(c.amount)}</td>
                <td>{money(c.unapplied_amount)}</td>
                <td><span className={`badge ${c.status === 'applied' ? 'badge-success' : 'badge-neutral'}`}>{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function CommunicationsTab({ entityId }) {
  const { hasPermission } = useAuth();
  // CommunicationLog is already generic across relatedType — this is the
  // same component CustomerLedger uses today, not a new endpoint.
  return <CommunicationLog relatedType="customer" relatedId={entityId} canManage={hasPermission('sales.customers.manage')} />;
}

function DocumentsTab({ entityId }) {
  // AttachmentsPanel already exists and is generic across relatedType —
  // this was wrongly stubbed as "not built yet" before checking Customers.jsx.
  return <AttachmentsPanel relatedType="customer" relatedId={entityId} />;
}

// ------------------------------------------------------------------
// Right rail
// ------------------------------------------------------------------

function OpenInvoicesRail({ entityId }) {
  const [invoices, setInvoices] = useState(null);

  useEffect(() => {
    // Reuses the same ledger endpoint as the Transactions tab. Slightly
    // redundant if both are visible at once — fine for a v1; if this
    // becomes a real cost, split a lightweight /customers/:id/summary
    // endpoint out of getCustomerLedger later.
    api.get(`/customers/${entityId}/ledger`).then(({ data }) => setInvoices(data.invoices)).catch(() => setInvoices([]));
  }, [entityId]);

  if (invoices === null) return <p>Loading...</p>;
  const open = invoices.filter((inv) => Number(inv.balance) > 0);
  if (open.length === 0) return <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No open invoices.</p>;

  return (
    <ul className="feed-list">
      {open.map((inv) => (
        <li key={inv.id}>
          <span className="feed-list-title">{inv.invoice_no}</span>
          <span className="feed-list-detail">{money(inv.balance)} due {new Date(inv.due_date).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------

export const customerFactSheetConfig = {
  entityLabel: 'customer',
  headerEndpoint: (id) => `/customers/${id}`,
  title: (header) => header.name,
  statusBadge: (header) => ({
    label: header.is_active ? 'Active' : 'Inactive',
    variant: header.is_active ? 'success' : 'neutral',
  }),
  stats: (header) => [
    { label: 'Outstanding balance', value: money(header.outstanding_balance) },
    { label: 'Credit limit', value: money(header.credit_limit) },
  ],
  tabs: [
    { key: 'overview', label: 'Overview', render: OverviewTab },
    { key: 'transactions', label: 'Transactions', render: TransactionsTab },
    { key: 'communications', label: 'Communications', render: CommunicationsTab },
    { key: 'documents', label: 'Documents', render: DocumentsTab },
  ],
  rightRail: [
    { key: 'openInvoices', label: 'Open invoices', render: OpenInvoicesRail },
  ],
};
