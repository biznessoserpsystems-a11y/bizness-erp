import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// Tells an Inventory page whether to show Edit / Delete buttons. The company switch
// (Inventory > Settings) must be on, and for Delete the user's role must also have
// inventory.records.delete. Fails closed: if the switches can't be loaded, nothing shows.
export default function useInventoryControls() {
  const { hasPermission } = useAuth();
  const [controls, setControls] = useState({ allow_edit: false, allow_delete: false });

  useEffect(() => {
    api.get('/inventory/record-controls')
      .then((r) => setControls(r.data))
      .catch(() => setControls({ allow_edit: false, allow_delete: false }));
  }, []);

  return {
    editEnabled: !!controls.allow_edit,
    canDelete: hasPermission('inventory.records.delete') && !!controls.allow_delete,
  };
}
