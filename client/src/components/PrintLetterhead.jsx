import { useAuth } from '../context/AuthContext';
import CompanyLogo from './CompanyLogo';

// Deliberately invisible on screen (see .print-letterhead in styles.css)
// and shown only inside @media print — rendered once, at the top of
// DashboardLayout, so it appears on every printed page across the whole
// app rather than needing every individual report page to add it itself.
// Company data comes from AuthContext, fetched once at the top level
// rather than by this component directly, so mounting it on every page
// doesn't mean a fresh company fetch on every page.
export default function PrintLetterhead() {
  const { company } = useAuth();
  if (!company) return null;

  const addressLine = [company.address, company.city, company.region].filter(Boolean).join(', ');

  return (
    <div className="print-letterhead">
      <CompanyLogo companyId={company.id} size={48} radius={6} />
      <div>
        <div className="print-letterhead-name">{company.name}</div>
        {addressLine && <div className="print-letterhead-address">{addressLine}</div>}
      </div>
    </div>
  );
}
