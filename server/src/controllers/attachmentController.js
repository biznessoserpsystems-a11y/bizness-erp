const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const RELATED_TYPES = ['task', 'calendar_event', 'invoice', 'purchase_order', 'customer', 'supplier', 'employee', 'candidate', 'compliance_document', 'sales_order', 'quotation', 'product', 'company'];

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Each entry checks that (a) the record exists in this company, and
// (b) the requesting user is allowed to see it — reusing the same
// permission or ownership rule that already governs that entity
// elsewhere in the app, rather than inventing a new one here.
const RELATED_TYPE_RULES = {
  customer: async (req, id) => {
    const { rows } = await db.query('SELECT 1 FROM customers WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Customer not found');
  },
  supplier: async (req, id) => {
    const { rows } = await db.query('SELECT 1 FROM suppliers WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Supplier not found');
  },
  // Product photos — viewable by anyone who can see the product catalog
  // (same as customer/supplier); uploads go through the same generic check.
  product: async (req, id) => {
    const { rows } = await db.query('SELECT 1 FROM products WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Product not found');
  },
  invoice: async (req, id) => {
    if (!(req.user.permissions || []).includes('sales.invoices.manage')) throw new ApiError(403, 'Missing required permission: sales.invoices.manage');
    const { rows } = await db.query('SELECT 1 FROM sales_invoices WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Invoice not found');
  },
  purchase_order: async (req, id) => {
    if (!(req.user.permissions || []).includes('procurement.orders.manage')) throw new ApiError(403, 'Missing required permission: procurement.orders.manage');
    const { rows } = await db.query('SELECT 1 FROM purchase_orders WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Purchase order not found');
  },
  sales_order: async (req, id) => {
    if (!(req.user.permissions || []).includes('sales.orders.manage')) throw new ApiError(403, 'Missing required permission: sales.orders.manage');
    const { rows } = await db.query('SELECT 1 FROM sales_orders WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Sales order not found');
  },
  quotation: async (req, id) => {
    if (!(req.user.permissions || []).includes('sales.quotations.manage')) throw new ApiError(403, 'Missing required permission: sales.quotations.manage');
    const { rows } = await db.query('SELECT 1 FROM quotations WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Quotation not found');
  },
  employee: async (req, id) => {
    // Employee documents (contracts, ID scans, certificates) are more sensitive
    // than the base employee record, so this is gated even though viewing an
    // employee's profile itself currently isn't.
    if (!(req.user.permissions || []).includes('hr.employees.manage')) throw new ApiError(403, 'Missing required permission: hr.employees.manage');
    const { rows } = await db.query('SELECT 1 FROM employees WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Employee not found');
  },
  candidate: async (req, id) => {
    if (!(req.user.permissions || []).includes('hr.recruitment.manage')) throw new ApiError(403, 'Missing required permission: hr.recruitment.manage');
    const { rows } = await db.query('SELECT 1 FROM candidates WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Candidate not found');
  },
  compliance_document: async (req, id) => {
    const canManage = (req.user.permissions || []).includes('hr.compliance.manage');
    const { rows } = await db.query('SELECT employee_id FROM compliance_documents WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Compliance document not found');
    if (!canManage) {
      const doc = rows[0];
      if (doc.employee_id !== null) {
        const own = await db.query('SELECT 1 FROM employees WHERE id = $1 AND user_id = $2 AND company_id = $3', [doc.employee_id, req.user.id, req.user.companyId]);
        if (!own.rows.length) throw new ApiError(403, 'You can only access your own compliance documents');
      }
      // employee_id IS NULL => company-wide document, viewable by anyone.
    }
  },
  task: async (req, id) => {
    const { rows } = await db.query('SELECT created_by, assigned_to FROM tasks WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Task not found');
    const t = rows[0];
    const manageAll = (req.user.permissions || []).includes('tasks.manage_all');
    if (!manageAll && t.created_by !== req.user.id && t.assigned_to !== req.user.id) throw new ApiError(403, 'You do not have access to this task');
  },
  // Company logo — visible to everyone in the company (it shows up on
  // invoices/receipts/PDFs), but uploading or removing it is restricted to
  // the same permission that gates the rest of the Company Profile page.
  // Unlike every other type here, relatedId is the company itself, so the
  // check is just "does this attachment belong to your own company".
  company: async (req, id) => {
    if (id !== req.user.companyId) throw new ApiError(404, 'Company not found');
    if (req.method !== 'GET' && !(req.user.permissions || []).includes('system.company.manage')) {
      throw new ApiError(403, 'Missing required permission: system.company.manage');
    }
  },
  calendar_event: async (req, id) => {
    const { rows } = await db.query('SELECT id FROM calendar_events WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Event not found');
    const manageAll = (req.user.permissions || []).includes('calendar.manage_all');
    if (!manageAll) {
      const attendee = await db.query('SELECT 1 FROM calendar_event_attendees WHERE event_id = $1 AND user_id = $2', [id, req.user.id]);
      if (!attendee.rows.length) throw new ApiError(403, 'You do not have access to this event');
    }
  },
};

async function assertCanAccess(req, relatedType, relatedId) {
  if (!RELATED_TYPES.includes(relatedType)) throw new ApiError(400, `relatedType must be one of: ${RELATED_TYPES.join(', ')}`);
  await RELATED_TYPE_RULES[relatedType](req, relatedId);
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
  'application/zip',
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// GET /attachments?relatedType=&relatedId=
const listAttachments = asyncHandler(async (req, res) => {
  const { relatedType, relatedId } = req.query;
  if (!relatedType || !relatedId) throw new ApiError(400, 'relatedType and relatedId are required');
  await assertCanAccess(req, relatedType, relatedId);

  const { rows } = await db.query(
    `SELECT a.id, a.file_name, a.mime_type, a.size_bytes, a.created_at,
            u.first_name AS uploaded_by_first_name, u.last_name AS uploaded_by_last_name
     FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
     WHERE a.company_id = $1 AND a.related_type = $2 AND a.related_id = $3
     ORDER BY a.created_at DESC`,
    [req.user.companyId, relatedType, relatedId]
  );
  res.json(rows);
});

// POST /attachments (multipart/form-data: file, relatedType, relatedId)
const uploadAttachment = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'file is required');
  const { relatedType, relatedId } = req.body;
  if (!relatedType || !relatedId) throw new ApiError(400, 'relatedType and relatedId are required');
  await assertCanAccess(req, relatedType, relatedId);

  if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
    throw new ApiError(400, 'That file type is not supported. Allowed: PDF, images, Word, Excel, CSV, text, zip.');
  }

  const storageKey = `${crypto.randomUUID()}${path.extname(req.file.originalname).slice(0, 10)}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storageKey), req.file.buffer);

  const { rows } = await db.query(
    `INSERT INTO attachments (company_id, related_type, related_id, file_name, storage_key, mime_type, size_bytes, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, file_name, mime_type, size_bytes, created_at`,
    [req.user.companyId, relatedType, relatedId, req.file.originalname, storageKey, req.file.mimetype, req.file.size, req.user.id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'attachment', entityId: rows[0].id, newValues: { relatedType, relatedId, fileName: req.file.originalname }, ip: req.ip });
  res.status(201).json(rows[0]);
});

async function loadAttachment(id, req) {
  const { rows } = await db.query('SELECT * FROM attachments WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Attachment not found');
  const attachment = rows[0];
  await assertCanAccess(req, attachment.related_type, attachment.related_id);
  return attachment;
}

// GET /attachments/:id/download
const downloadAttachment = asyncHandler(async (req, res) => {
  const attachment = await loadAttachment(req.params.id, req);
  const filePath = path.join(UPLOAD_DIR, attachment.storage_key);
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'File is missing from storage');

  res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name.replace(/"/g, '')}"`);
  fs.createReadStream(filePath).pipe(res);
});

// DELETE /attachments/:id
const deleteAttachment = asyncHandler(async (req, res) => {
  const attachment = await loadAttachment(req.params.id, req);

  const filePath = path.join(UPLOAD_DIR, attachment.storage_key);
  fs.unlink(filePath, () => {}); // best-effort; a missing file shouldn't block removing the DB row

  await db.query('DELETE FROM attachments WHERE id = $1', [attachment.id]);
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'attachment', entityId: attachment.id, ip: req.ip });
  res.status(204).send();
});

module.exports = { listAttachments, uploadAttachment, downloadAttachment, deleteAttachment, MAX_FILE_SIZE };
