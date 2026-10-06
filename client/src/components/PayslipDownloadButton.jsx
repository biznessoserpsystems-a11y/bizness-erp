import { useState } from 'react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

// Downloads one payslip as a PDF. Use mine for an employee's own payslip (self-service);
// without it the request goes to the payroll endpoint that needs the payroll view permission.
export default function PayslipDownloadButton({ payslipId, filename, mine = false }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const url = mine ? `/me/payslips/${payslipId}/pdf` : `/payslips/${payslipId}/pdf`;
      const res = await api.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      // with responseType 'blob' an error body arrives as a Blob, so read the message out of it
      let message = 'Failed to download payslip';
      try {
        const text = await err.response?.data?.text?.();
        if (text) message = JSON.parse(text).error || message;
      } catch { /* keep the default message */ }
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={handleClick} disabled={busy}>
      {busy ? 'Preparing...' : 'Download PDF'}
    </button>
  );
}
