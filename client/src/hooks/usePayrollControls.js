import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// Tells the Payroll tab whether to show Edit / Delete buttons on payroll runs: the company
// switch (HR & Payroll > Settings) must be on AND the user's role must have the permission.
// Fails closed — if the switches can't be loaded, no buttons are shown.
export default function usePayrollControls() {
  const { hasPermission } = useAuth();
  const [controls, setControls] = useState({ allow_edit: false, allow_delete: false });

  useEffect(() => {
    api.get('/payroll/record-controls')
      .then((r) => setControls(r.data))
      .catch(() => setControls({ allow_edit: false, allow_delete: false }));
  }, []);

  return {
    canEdit: hasPermission('hr.payroll.edit') && !!controls.allow_edit,
    canDelete: hasPermission('hr.payroll.delete') && !!controls.allow_delete,
  };
}
