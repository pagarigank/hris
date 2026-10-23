import sql from 'mssql';
import { createDoc, drawHeader, drawTable, drawLine, addPageNumbers, phCurrency, CompanyInfo } from './pdfUtils';

export async function generateThirteenthMonthPdf(
  pool: sql.ConnectionPool,
  tenantId: string,
  year: number,
): Promise<Buffer> {
  const result = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('Year', sql.Int, year)
    .query(`
      SELECT e.EmployeeNo, e.FirstName, e.LastName, d.Name AS Department,
             t.TotalBasicSalaryEarned, t.ComputedAmount, t.PayoutStatus, t.PaidDate
      FROM dbo.ThirteenthMonthPay t
      INNER JOIN dbo.Employees e ON t.EmployeeId = e.Id
      LEFT JOIN dbo.Departments d ON e.DepartmentId = d.Id
      WHERE t.TenantId = @TenantId AND t.Year = @Year AND t.IsDeleted = 0
      ORDER BY e.LastName, e.FirstName
    `);

  const tenantResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT CompanyName, Address, TIN FROM dbo.Tenants WHERE Id = @TenantId`);
  const tenant = tenantResult.recordset[0] as CompanyInfo;

  const company: CompanyInfo = { name: tenant?.name || 'Company', address: tenant?.address, tin: tenant?.tin };
  const doc = createDoc(true);

  drawHeader(doc, `13TH MONTH PAY ${year}`, company, `Computation per PD 851 | Total Basic Salary Earned / 12`);

  let y = doc.y + 2;

  const headers = [
    { label: 'Emp No', width: 60, align: 'center' as const },
    { label: 'Employee Name', width: 150 },
    { label: 'Department', width: 120 },
    { label: 'Total Basic Salary Earned', width: 110, align: 'right' as const },
    { label: '13th Month Pay', width: 100, align: 'right' as const },
    { label: 'Status', width: 70, align: 'center' as const },
    { label: 'Paid Date', width: 80, align: 'center' as const },
  ];

  const rows: (string | number)[][] = [];
  let totalEarned = 0, totalComputed = 0;

  for (const r of result.recordset) {
    totalEarned += r.TotalBasicSalaryEarned || 0;
    totalComputed += r.ComputedAmount || 0;
    rows.push([
      r.EmployeeNo,
      `${r.LastName}, ${r.FirstName}`,
      r.Department || 'N/A',
      phCurrency(r.TotalBasicSalaryEarned || 0),
      phCurrency(r.ComputedAmount || 0),
      r.PayoutStatus || 'Pending',
      r.PaidDate ? new Date(r.PaidDate).toLocaleDateString('en-PH') : '-',
    ]);
  }

  rows.push(['', 'TOTALS', '', phCurrency(totalEarned), phCurrency(totalComputed), '', '']);

  y = drawTable(doc, headers, rows, y);
  y += 15;

  doc.fontSize(8).font('Helvetica-Bold');
  doc.text(`Total Employees: ${result.recordset.length}`, 50, y);
  doc.text(`Total 13th Month Pay: ${phCurrency(totalComputed)}`, 300, y);
  y += 20;

  drawLine(doc, y);
  y += 10;

  doc.fontSize(7).font('Helvetica');
  doc.text('Note: 13th Month Pay = Total Basic Salary Earned in Calendar Year / 12 (PD 851)', 50, y);
  y += 12;
  doc.text('Must be paid on or before December 24 each year.', 50, y);
  y += 20;
  doc.text('Prepared by: _________________________    Reviewed by: _________________________    Approved by: _________________________', 50, y);

  addPageNumbers(doc);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
