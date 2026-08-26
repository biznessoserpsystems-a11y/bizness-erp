import { createContext, useCallback, useContext, useState } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);

  // confirm('message', { title, confirmLabel, danger }) -> Promise<boolean>
  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setRequest({
        message,
        resolve,
        title: opts.title || 'Please confirm',
        confirmLabel: opts.confirmLabel || 'Confirm',
        danger: !!opts.danger,
      });
    });
  }, []);

  function settle(result) {
    request?.resolve(result);
    setRequest(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div className="modal-overlay" onClick={() => settle(false)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{request.title}</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{request.message}</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => settle(false)}>Cancel</button>
              <button
                className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`}
                style={{ width: 'auto' }}
                onClick={() => settle(true)}
                autoFocus
              >
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
