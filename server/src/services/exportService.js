const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType } = require('docx');

/**
 * Three data shapes cover every report in the Reports module:
 *
 * 1. Table shape — a flat list (receivables aging, sales register, stock
 *    valuation, etc.):
 *      { title, subtitle?, columns: [{ key, label, align?, format? }], rows: [{...}] }
 *    `format` is 'currency' | 'number' | 'date' | undefined (plain text).
 *
 * 2. Statement shape — a sectioned financial statement (income statement,
 *    balance sheet):
 *      { title, subtitle?, sections: [{ title, lines: [{label, amount}], total: {label, amount} }],
 *        grandTotal？: {label, amount} }
 *
 * 3. Multi-table shape — several differently-shaped tables in one document
 *    (a report with many distinct sections, each its own table — e.g. the
 *    17-section Inventory Management Report):
 *      { title, subtitle?, tables: [{ heading, columns: [{key,label,align?,format?}], rows: [{...}] }] }
 *    Each table gets its own heading and header row; an empty `rows` array
 *    renders "No data for this section" rather than an empty table.
 *
 * Every builder returns a Buffer; the controller sets response headers and
 * writes it — this file has no knowledge of Express at all.
 */

function fmtCell(value, format) {
  if (value === null || value === undefined) return '';
  if (format === 'currency') return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (format === 'number') return Number(value).toLocaleString();
  if (format === 'date') return new Date(value).toLocaleDateString();
  return String(value);
}

// ---------------------------------------------------------------- Excel ----

async function tableToExcel({ title, subtitle, columns, rows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bizness-OS';
  wb.created = new Date();
  const sheet = wb.addWorksheet(title.slice(0, 31) || 'Report');

  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { size: 14, bold: true };

  let headerRowIndex = 2;
  if (subtitle) {
    sheet.mergeCells(2, 1, 2, columns.length);
    const subCell = sheet.getCell(2, 1);
    subCell.value = subtitle;
    subCell.font = { size: 10, color: { argb: 'FF726B5C' } };
    headerRowIndex = 3;
  }

  const headerRow = sheet.getRow(headerRowIndex);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B6E4F' } };
    cell.alignment = { horizontal: col.align || 'left' };
  });

  rows.forEach((row) => {
    const r = sheet.addRow(columns.map((col) => {
      const raw = row[col.key];
      if (col.format === 'currency' || col.format === 'number') return raw === null || raw === undefined ? null : Number(raw);
      if (col.format === 'date') return raw ? new Date(raw) : null;
      return raw ?? '';
    }));
    columns.forEach((col, i) => {
      const cell = r.getCell(i + 1);
      cell.alignment = { horizontal: col.align || 'left' };
      if (col.format === 'currency') cell.numFmt = '#,##0.00';
      if (col.format === 'date') cell.numFmt = 'dd/mm/yyyy';
    });
  });

  columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = Math.max(12, col.label.length + 2, col.width || 0);
  });

  return wb.xlsx.writeBuffer();
}

async function statementToExcel({ title, subtitle, sections, grandTotal }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bizness-OS';
  wb.created = new Date();
  const sheet = wb.addWorksheet(title.slice(0, 31) || 'Statement');

  sheet.mergeCells(1, 1, 1, 2);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { size: 14, bold: true };
  let row = 2;
  if (subtitle) {
    sheet.mergeCells(row, 1, row, 2);
    sheet.getCell(row, 1).value = subtitle;
    sheet.getCell(row, 1).font = { size: 10, color: { argb: 'FF726B5C' } };
    row += 1;
  }
  row += 1;

  for (const section of sections) {
    sheet.getCell(row, 1).value = section.title;
    sheet.getCell(row, 1).font = { bold: true, size: 12 };
    row += 1;

    for (const line of section.lines) {
      sheet.getCell(row, 1).value = line.label;
      if (line.amount !== null && line.amount !== undefined) {
        const amountCell = sheet.getCell(row, 2);
        amountCell.value = Number(line.amount);
        amountCell.numFmt = '#,##0.00';
      }
      row += 1;
    }

    if (section.total) {
      const labelCell = sheet.getCell(row, 1);
      labelCell.value = section.total.label;
      labelCell.font = { bold: true };
      const amountCell = sheet.getCell(row, 2);
      amountCell.value = Number(section.total.amount);
      amountCell.numFmt = '#,##0.00';
      amountCell.font = { bold: true };
      amountCell.border = { top: { style: 'thin' } };
      row += 2;
    } else {
      row += 1;
    }
  }

  if (grandTotal) {
    const labelCell = sheet.getCell(row, 1);
    labelCell.value = grandTotal.label;
    labelCell.font = { bold: true, size: 12 };
    const amountCell = sheet.getCell(row, 2);
    amountCell.value = Number(grandTotal.amount);
    amountCell.numFmt = '#,##0.00';
    amountCell.font = { bold: true, size: 12 };
    amountCell.border = { top: { style: 'double' } };
  }

  sheet.getColumn(1).width = 42;
  sheet.getColumn(2).width = 20;

  return wb.xlsx.writeBuffer();
}

// Many differently-shaped tables in one document, stacked on a single
// worksheet with a heading row above each — a report with distinct
// sections, each its own table (e.g. Inventory Management Report's 17
// sections), rather than one uniform table.
async function multiTableToExcel({ title, subtitle, tables }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bizness-OS';
  wb.created = new Date();
  const maxCols = Math.max(1, ...tables.map((t) => t.columns.length));
  const sheet = wb.addWorksheet(title.slice(0, 31) || 'Report');

  sheet.mergeCells(1, 1, 1, maxCols);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { size: 14, bold: true };
  let rowIndex = 2;
  if (subtitle) {
    sheet.mergeCells(rowIndex, 1, rowIndex, maxCols);
    const subCell = sheet.getCell(rowIndex, 1);
    subCell.value = subtitle;
    subCell.font = { size: 10, color: { argb: 'FF726B5C' } };
    rowIndex += 1;
  }
  rowIndex += 1;

  for (const t of tables) {
    sheet.mergeCells(rowIndex, 1, rowIndex, maxCols);
    const headingCell = sheet.getCell(rowIndex, 1);
    headingCell.value = t.heading;
    headingCell.font = { size: 12, bold: true, color: { argb: 'FF0B6E4F' } };
    rowIndex += 1;

    const headerRow = sheet.getRow(rowIndex);
    t.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B6E4F' } };
      cell.alignment = { horizontal: col.align || 'left' };
    });
    rowIndex += 1;

    if (t.rows.length === 0) {
      const cell = sheet.getCell(rowIndex, 1);
      cell.value = 'No data for this section.';
      cell.font = { italic: true, color: { argb: 'FF726B5C' } };
      rowIndex += 1;
    } else {
      for (const row of t.rows) {
        const r = sheet.getRow(rowIndex);
        t.columns.forEach((col, i) => {
          const raw = row[col.key];
          const cell = r.getCell(i + 1);
          if (col.format === 'currency' || col.format === 'number') {
            cell.value = raw === null || raw === undefined ? null : Number(raw);
            if (col.format === 'currency') cell.numFmt = '#,##0.00';
          } else if (col.format === 'date') {
            cell.value = raw ? new Date(raw) : null;
            cell.numFmt = 'dd/mm/yyyy';
          } else {
            cell.value = raw ?? '';
          }
          cell.alignment = { horizontal: col.align || 'left' };
        });
        rowIndex += 1;
      }
    }
    rowIndex += 1; // blank row between sections
  }

  for (let i = 1; i <= maxCols; i += 1) {
    sheet.getColumn(i).width = 20;
  }

  return wb.xlsx.writeBuffer();
}

// ------------------------------------------------------------------ PDF ----

function newPdfDoc(title, subtitle, options = {}) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: options.layout || 'portrait' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0B6E4F').text(title);
  if (subtitle) doc.font('Helvetica').fontSize(10).fillColor('#726B5C').text(subtitle);
  doc.moveDown();
  doc.fillColor('#221F1A');
  return doc;
}

function collectPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// Shared by tableToPdf and multiTableToPdf — draws one table starting at the
// document's current y position, handling page breaks and re-drawing the
// header row on each new page. Doesn't touch the title/subtitle — callers
// decide what goes above each table.
function drawPdfTable(doc, columns, rows) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWeight = columns.reduce((s, c) => s + (c.width || 1), 0);
  const colWidths = columns.map((c) => (pageWidth * (c.width || 1)) / totalWeight);
  const colX = [doc.page.margins.left];
  colWidths.forEach((w, i) => { if (i > 0) colX.push(colX[i - 1] + colWidths[i - 1]); });
  const rowHeight = 18;

  function drawHeader() {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9);
    columns.forEach((col, i) => {
      doc.text(col.label, colX[i], y, { width: colWidths[i] - 6, align: col.align || 'left' });
    });
    doc.moveDown(1.2);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#E7E0D2').stroke();
    doc.moveDown(0.3);
  }

  drawHeader();
  doc.font('Helvetica').fontSize(9);
  for (const row of rows) {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
      doc.font('Helvetica').fontSize(9);
    }
    const y = doc.y;
    columns.forEach((col, i) => {
      const text = fmtCell(row[col.key], col.format);
      doc.text(text, colX[i], y, { width: colWidths[i] - 6, align: col.align || 'left' });
    });
    doc.moveDown(0.9);
  }
}

function tableToPdf({ title, subtitle, columns, rows }) {
  // Tabular reports (as opposed to statements) tend to have several columns
  // and real values that run long — auto-generated invoice numbers in this
  // system look like "INV-1785110980844" — so these get more breathing room
  // in landscape, and any column can request extra share of the width via
  // `width` (a relative weight, default 1) rather than a strict equal split.
  const doc = newPdfDoc(title, subtitle, { layout: 'landscape' });
  drawPdfTable(doc, columns, rows);
  return collectPdfBuffer(doc);
}

function statementToPdf({ title, subtitle, sections, grandTotal }) {
  const doc = newPdfDoc(title, subtitle);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  for (const section of sections) {
    doc.font('Helvetica-Bold').fontSize(12).text(section.title);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    for (const line of section.lines) {
      const y = doc.y;
      doc.text(line.label, left, y, { width: 320 });
      doc.text(fmtCell(line.amount, 'currency'), left + 320, y, { width: right - left - 320, align: 'right' });
      doc.moveDown(0.6);
    }
    if (section.total) {
      doc.moveTo(left + 320, doc.y).lineTo(right, doc.y).strokeColor('#221F1A').stroke();
      doc.moveDown(0.2);
      const y = doc.y;
      doc.font('Helvetica-Bold');
      doc.text(section.total.label, left, y, { width: 320 });
      doc.text(fmtCell(section.total.amount, 'currency'), left + 320, y, { width: right - left - 320, align: 'right' });
      doc.font('Helvetica');
      doc.moveDown(1);
    }
    doc.moveDown(0.4);
  }

  if (grandTotal) {
    doc.moveTo(left + 320, doc.y).lineTo(right, doc.y).strokeColor('#221F1A').lineWidth(1.5).stroke();
    doc.moveDown(0.2);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text(grandTotal.label, left, y, { width: 320 });
    doc.text(fmtCell(grandTotal.amount, 'currency'), left + 320, y, { width: right - left - 320, align: 'right' });
  }

  return collectPdfBuffer(doc);
}

// Many differently-shaped tables in one document (a report with distinct
// sections, each its own table — e.g. Inventory Management Report's 17
// sections) — landscape, one heading + table per section, each starting on
// a fresh check against remaining page space rather than always a new page,
// so short tables don't waste paper.
function multiTableToPdf({ title, subtitle, tables }) {
  const doc = newPdfDoc(title, subtitle, { layout: 'landscape' });
  for (const t of tables) {
    if (doc.y + 60 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0B6E4F').text(t.heading);
    doc.fillColor('#221F1A');
    doc.moveDown(0.3);
    if (t.rows.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#726B5C').text('No data for this section.');
      doc.fillColor('#221F1A');
      doc.moveDown(0.8);
      continue;
    }
    drawPdfTable(doc, t.columns, t.rows);
    doc.moveDown(0.8);
  }
  return collectPdfBuffer(doc);
}

// ----------------------------------------------------------------- Word ----

async function tableToDocx({ title, subtitle, columns, rows }) {
  const headerRow = new TableRow({
    children: columns.map((col) => new TableCell({
      shading: { fill: '0B6E4F' },
      children: [new Paragraph({ children: [new TextRun({ text: col.label, bold: true, color: 'FFFFFF' })] })],
    })),
  });

  const bodyRows = rows.map((row) => new TableRow({
    children: columns.map((col) => new TableCell({
      children: [new Paragraph({
        alignment: col.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun(fmtCell(row[col.key], col.format))],
      })],
    })),
  }));

  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
  ];
  if (subtitle) children.push(new Paragraph({ text: subtitle }));
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] }));

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

async function statementToDocx({ title, subtitle, sections, grandTotal }) {
  const children = [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 })];
  if (subtitle) children.push(new Paragraph({ text: subtitle }));

  for (const section of sections) {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2, spacing: { before: 200 } }));
    for (const line of section.lines) {
      children.push(new Paragraph({
        tabStops: [{ type: 'right', position: 8000 }],
        children: [new TextRun(`${line.label}\t${fmtCell(line.amount, 'currency')}`)],
      }));
    }
    if (section.total) {
      children.push(new Paragraph({
        tabStops: [{ type: 'right', position: 8000 }],
        children: [new TextRun({ text: `${section.total.label}\t${fmtCell(section.total.amount, 'currency')}`, bold: true })],
      }));
    }
  }

  if (grandTotal) {
    children.push(new Paragraph({
      spacing: { before: 300 },
      tabStops: [{ type: 'right', position: 8000 }],
      children: [new TextRun({ text: `${grandTotal.label}\t${fmtCell(grandTotal.amount, 'currency')}`, bold: true, size: 28 })],
    }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// Many differently-shaped tables in one document — one Heading2 + table per
// section, in document order. Reuses the exact same header/cell styling as
// the single-table docx builder above (kept inline rather than extracted,
// since docx's Table/TableRow construction is only a few lines here).
async function multiTableToDocx({ title, subtitle, tables }) {
  const children = [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 })];
  if (subtitle) children.push(new Paragraph({ text: subtitle }));

  for (const t of tables) {
    children.push(new Paragraph({ text: t.heading, heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
    if (t.rows.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'No data for this section.', italics: true })] }));
      continue;
    }
    const headerRow = new TableRow({
      children: t.columns.map((col) => new TableCell({
        shading: { fill: '0B6E4F' },
        children: [new Paragraph({ children: [new TextRun({ text: col.label, bold: true, color: 'FFFFFF' })] })],
      })),
    });
    const bodyRows = t.rows.map((row) => new TableRow({
      children: t.columns.map((col) => new TableCell({
        children: [new Paragraph({
          alignment: col.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun(fmtCell(row[col.key], col.format))],
        })],
      })),
    }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// -------------------------------------------------------------- dispatch ----

const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** data is { columns, rows, ... } (table), { sections, ... } (statement), or { tables, ... } (multi-table). */
async function buildExport(format, data) {
  const isMultiTable = Array.isArray(data.tables);
  const isStatement = Array.isArray(data.sections);
  const builders = isMultiTable
    ? { xlsx: multiTableToExcel, pdf: multiTableToPdf, docx: multiTableToDocx }
    : isStatement
      ? { xlsx: statementToExcel, pdf: statementToPdf, docx: statementToDocx }
      : { xlsx: tableToExcel, pdf: tableToPdf, docx: tableToDocx };

  const builder = builders[format];
  if (!builder) throw new Error(`Unsupported export format: ${format}`);
  return builder(data);
}

/** Sends the built buffer with the right content-type/disposition headers. Express-aware, unlike the builders above. */
async function sendExport(res, format, filenameBase, data) {
  if (!MIME[format]) {
    res.status(400).json({ error: `format must be one of: ${Object.keys(MIME).join(', ')}` });
    return;
  }
  const buffer = await buildExport(format, data);
  res.setHeader('Content-Type', MIME[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.${format}"`);
  res.send(buffer);
}

module.exports = { buildExport, sendExport, MIME, fmtCell };
