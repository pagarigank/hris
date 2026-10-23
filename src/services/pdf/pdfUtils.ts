import PDFDocument from 'pdfkit';
type PDFDoc = InstanceType<typeof PDFDocument>;

export interface CompanyInfo {
  name: string;
  address?: string;
  tin?: string;
  sssEmployerNo?: string;
  philHealthEmployerNo?: string;
  pagIbigEmployerNo?: string;
}

export interface TableHeader {
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

export function createDoc(landscape = false): PDFDoc {
  const doc = new PDFDocument({
    size: 'A4',
    layout: landscape ? 'landscape' : 'portrait',
    margins: { top: 40, bottom: 50, left: 50, right: 50 },
    bufferPages: true,
  });
  return doc;
}

export function phCurrency(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function drawHeader(doc: PDFDoc, title: string, company: CompanyInfo, period?: string) {
  const pageWidth = doc.page.width - 100;
  doc.fontSize(14).font('Helvetica-Bold').text(company.name, 50, 40, { width: pageWidth, align: 'center' });
  doc.fontSize(8).font('Helvetica').text(company.address || '', { width: pageWidth, align: 'center' });
  if (company.tin) doc.text(`TIN: ${company.tin}`, { width: pageWidth, align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica-Bold').text(title, { width: pageWidth, align: 'center' });
  if (period) {
    doc.fontSize(9).font('Helvetica').text(period, { width: pageWidth, align: 'center' });
  }
  doc.moveDown(0.5);
}

export function drawFooter(doc: PDFDoc, pageNum: number, totalPages: number) {
  const pageWidth = doc.page.width;
  doc.fontSize(7).font('Helvetica')
    .text(`Generated: ${new Date().toLocaleDateString('en-PH')} | Page ${pageNum} of ${totalPages}`, 50, doc.page.height - 35, {
      width: pageWidth - 100,
      align: 'center',
    });
}

export function drawTable(
  doc: PDFDoc,
  headers: TableHeader[],
  rows: (string | number)[][],
  startY: number,
  opts?: { zebraStripe?: boolean; headerBg?: string }
) {
  const x = 50;
  const rowHeight = 18;
  const headerHeight = 22;
  const headerBg = opts?.headerBg || '#1a365d';
  const zebra = opts?.zebraStripe !== false;

  let y = startY;

  // Header row
  doc.rect(x, y, headers.reduce((s, h) => s + h.width, 0), headerHeight).fill(headerBg);
  doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
  let cx = x;
  for (const h of headers) {
    const align = h.align || 'left';
    const textX = align === 'right' ? cx + h.width - 4 : align === 'center' ? cx + h.width / 2 : cx + 4;
    doc.text(h.label, textX, y + 6, { width: h.width - 8, align });
    cx += h.width;
  }
  y += headerHeight;
  doc.fillColor('#000000');

  // Data rows
  doc.font('Helvetica').fontSize(7);
  for (let i = 0; i < rows.length; i++) {
    if (y + rowHeight > doc.page.height - 60) {
      doc.addPage();
      y = 40;
      // Redraw header on new page
      doc.rect(x, y, headers.reduce((s, h) => s + h.width, 0), headerHeight).fill(headerBg);
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
      cx = x;
      for (const h of headers) {
        const align = h.align || 'left';
        const textX = align === 'right' ? cx + h.width - 4 : align === 'center' ? cx + h.width / 2 : cx + 4;
        doc.text(h.label, textX, y + 6, { width: h.width - 8, align });
        cx += h.width;
      }
      y += headerHeight;
      doc.fillColor('#000000').font('Helvetica').fontSize(7);
    }

    if (zebra && i % 2 === 1) {
      doc.rect(x, y, headers.reduce((s, h) => s + h.width, 0), rowHeight).fill('#f0f0f0');
      doc.fillColor('#000000');
    }

    cx = x;
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      const val = rows[i][j] ?? '';
      const align = h.align || 'left';
      const textX = align === 'right' ? cx + h.width - 4 : align === 'center' ? cx + h.width / 2 : cx + 4;
      doc.text(String(val), textX, y + 4, { width: h.width - 8, align });
      cx += h.width;
    }
    y += rowHeight;
  }

  return y;
}

export function drawLine(doc: PDFDoc, y: number) {
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).stroke('#cccccc');
}

export function drawKeyValue(doc: PDFDoc, key: string, value: string, x: number, y: number, keyWidth = 120, valWidth = 200) {
  doc.fontSize(8).font('Helvetica-Bold').text(key, x, y, { width: keyWidth });
  doc.font('Helvetica').text(value, x + keyWidth, y, { width: valWidth });
}

export function addPageNumbers(doc: PDFDoc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    drawFooter(doc, i + 1, range.count);
  }
}
