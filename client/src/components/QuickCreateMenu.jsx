import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconPlus } from './icons';

export const ACTIONS = [
  { label: 'Task', to: '/tasks' },
  { label: 'Event', to: '/calendar' },
  { label: 'Customer', to: '/sales/customers' },
  { label: 'Candidate', to: '/hr/recruitment', permission: 'hr.recruitment.manage' },
  { label: 'Sales Invoice', to: '/sales/invoices', permission: 'sales.invoices.manage' },
  { label: 'Sales Order', to: '/sales/orders', permission: 'sales.orders.manage' },
  { label: 'Purchase Order', to: '/procurement/purchase-orders', permission: 'procurement.orders.manage' },
  { label: 'Supplier', to: '/procurement/suppliers', permission: 'procurement.suppliers.manage' },
  { label: 'Journal Entry', to: '/accounting/journal', permission: 'accounting.journal.manage' },
  { label: 'Employee', to: '/hr/payroll' },
];

export default function QuickCreateMenu() {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const actions = ACTIONS.filter((a) => !a.permission || hasPermission(a.permission));

  return (
    <div ref={containerRef} className="dropdown-anchor">
      <button className="btn btn-primary btn-sm quick-create-btn" style={{ width: 'auto' }} onClick={() => setOpen((o) => !o)}>
        <IconPlus /> <span className="quick-create-label">Create</span>
      </button>
      {open && (
        <div className="dropdown-menu">
          <div className="dropdown-menu-title">Quick create</div>
          {actions.map((a) => (
            <button
              key={a.to + a.label}
              className="dropdown-menu-item"
              onClick={() => { setOpen(false); navigate(a.to); }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
