-- Let sales orders and quotations hold attachments (customer PO copies,
-- signed quotation PDFs, spec sheets) through the same generic attachments
-- module used elsewhere — same idiom as 017/019/024 before this.
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_related_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_related_type_check
  CHECK (related_type IN (
    'task', 'calendar_event', 'invoice', 'purchase_order', 'customer', 'supplier',
    'employee', 'candidate', 'compliance_document', 'sales_order', 'quotation'
  ));
