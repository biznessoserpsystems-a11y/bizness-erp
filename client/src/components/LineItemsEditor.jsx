import { useMemo } from 'react';

// Ghana's VAT Act, 2025 (Act 1151), effective 1 January 2026, recoupled NHIL (2.5%) and
// GETFund Levy (2.5%) into the VAT base alongside the 15% standard rate, all calculated on
// the same amount — a combined 20% (previously a cascading ~21.9% with a since-abolished
// 1% COVID-19 levy, and NHIL/GETFund weren't creditable as input tax). 20% is the correct
// default for a new taxable line today; still fully editable per line for zero-rated or
// exempt goods (see taxReportController.js's vatSummary for the standard/NHIL/GETFund split).
const emptyLine = () => ({ productId: '', quantity: '', unitPrice: '', discountPercent: 0, taxPercent: 20 });

export function useLineTotals(lines) {
  return useMemo(() => {
    let subtotal = 0, discount = 0, tax = 0, total = 0;
    for (const l of lines) {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unitPrice) || 0;
      const discPct = Number(l.discountPercent) || 0;
      const taxPct = Number(l.taxPercent) || 0;
      const lineSub = qty * price;
      const discAmt = lineSub * (discPct / 100);
      const taxable = lineSub - discAmt;
      const taxAmt = taxable * (taxPct / 100);
      subtotal += lineSub;
      discount += discAmt;
      tax += taxAmt;
      total += taxable + taxAmt;
    }
    return { subtotal, discount, tax, total };
  }, [lines]);
}

export default function LineItemsEditor({ lines, setLines, products, priceField = 'selling_price' }) {
  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const totals = useLineTotals(lines);

  return (
    <div>
      <table style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>Product</th>
            <th style={{ width: 80 }}>Qty</th>
            <th style={{ width: 100 }}>Unit price</th>
            <th style={{ width: 80 }}>Disc %</th>
            <th style={{ width: 80 }}>Tax %</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={idx}>
              <td>
                <select
                  value={line.productId}
                  onChange={(e) => {
                    const product = products.find((p) => p.id === e.target.value);
                    updateLine(idx, 'productId', e.target.value);
                    if (product?.[priceField]) updateLine(idx, 'unitPrice', product[priceField]);
                  }}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                  required
                >
                  <option value="">Select product</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </td>
              <td><input type="number" step="0.01" value={line.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} required /></td>
              <td><input type="number" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} required /></td>
              <td><input type="number" step="0.01" value={line.discountPercent} onChange={(e) => updateLine(idx, 'discountPercent', e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} /></td>
              <td><input type="number" step="0.01" value={line.taxPercent} onChange={(e) => updateLine(idx, 'taxPercent', e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} /></td>
              <td>{lines.length > 1 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeLine(idx)}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginBottom: 16 }}>+ Add line</button>

      <div style={{ background: '#F7F4EC', borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>GHS {totals.subtotal.toFixed(2)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><span>-GHS {totals.discount.toFixed(2)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><span>GHS {totals.tax.toFixed(2)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
          <span>Total</span><span>GHS {totals.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export { emptyLine };
