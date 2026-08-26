import ReportBuilder from '../components/ReportBuilder';

// The general-purpose ad-hoc report builder — every data source tagged
// domain: 'general' in biRegistry.js (Sales Invoices, Purchase Invoices,
// Products, Employees, General Ledger). School's own equivalent,
// AcademicIntelligence.jsx, renders the exact same underlying
// ReportBuilder component scoped to domain: 'school' instead — the two
// pages are genuinely separate experiences (different data sources,
// different saved reports, no cross-visibility), not the same page
// reused with a different label.
export default function BusinessIntelligence() {
  return (
    <ReportBuilder
      title="Business Intelligence"
      subtitle="Build your own report from Sales, Procurement, Products, or Employees"
      reportLabel="Business Intelligence Report"
    />
  );
}
