import { IconPrint } from './icons';

// A single, consistent way to trigger printing across the app, rather than
// each page inventing its own onClick={() => window.print()} inline. Uses
// the browser's native print dialog directly — no custom print preview —
// since the print stylesheet (see @media print in styles.css) already
// does the real work of stripping chrome down to something worth printing.
export default function PrintButton({ label = 'Print' }) {
  return (
    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => window.print()}>
      <IconPrint /> {label}
    </button>
  );
}
