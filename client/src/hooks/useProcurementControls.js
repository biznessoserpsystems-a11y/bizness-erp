import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// Tells a Procurement page whether to show Edit / Delete buttons: the company switch
// (Procurement > Settings) must be on AND the user's role must have the permission.
// Fails closed — if the switches can't be loaded, no buttons are shown.
export default function useProcurementControls() {
  const { hasPermission } = useAuth();
  const [controls, setControls] = useState({ allow_edit: false, allow_delete: false });

  useEffect(() => {
    api.get('/procurement/record-controls')
      .then((r) => setControls(r.data))
      .catch(() => setControls({ allow_edit: false, allow_delete: false }));
  }, []);

  return {
    canEdit: hasPermission('procurement.records.edit') && !!controls.allow_edit,
    canDelete: hasPermission('procurement.records.delete') && !!controls.allow_delete,
  };
}
