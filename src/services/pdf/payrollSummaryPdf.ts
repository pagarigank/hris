import sql from 'mssql';
import { createDoc, drawHeader, drawTable, drawLine, addPageNumbers, phCurrency, CompanyInfo } from './pdfUtils';

export async function generatePayrollSummaryPdf(
  pool: sql.ConnectionPool,
  tenantId: string,
  payrollRunId: string,
): Promise<Buffer> {
  const runResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('PayrollRunId', sql.UniqueIdentifier, payrollRunId)
    .query(`
      SELECT pr.*, pp.PeriodStart, pp.PeriodEnd, pp.PayDate, pp.PayFrequency
      FROM dbo.PayrollRuns pr
      INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
      WHERE pr.Id = @PayrollRunId AND pr.TenantId = @TenantId
    `);

  if (!runResult.recordset.length) throw new Error('Payroll run not found');
  const run = runResult.recordset[0];

  const payslipResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('PayrollRunId', sql.UniqueIdentifier, payrollRunId)
    .query(`
      SELECT e.EmployeeNo, e.FirstName, e.LastName, p.*
      FROM dbo.Payslips p
      INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id
      WHERE p.PayrollRunId = @PayrollRunId AND p.TenantId = @TenantId AND p.IsDeleted = 0
      ORDER BY e.LastName, e.FirstName
    `);

  const tenantResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT CompanyName, Address, TIN FROM dbo.Tenants WHERE Id = @TenantId`);
  const tenant = tenantResult.recordset[0] as CompanyInfo;

  const company: CompanyInfo = { name: tenant?.name || 'Company', address: tenant?.address, tin: tenant?.tin };
  const doc = createDoc(true);

  drawHeader(doc, 'PAYROLL SUMMARY / SALARY REGISTER', company,
    `Period: ${run.PeriodStart} to ${run.PeriodEnd} | Pay Date: ${run.PayDate} | Status: ${run.Status}`);

  let y = doc.y + 2;

  const headers = [
    { label: 'Emp No', width: 55, align: 'center' as const },
    { label: 'Employee Name', width: 130 },
    { label: 'Basic Pay', width: 65, align: 'right' as const },
    { label: 'OT Pay', width: 55, align: 'right' as const },
    { label: 'Night Diff', width: 55, align: 'right' as const },
    { label: 'Holiday', width: 55, align: 'right' as const },
    { label: 'Allowances', width: 60, align: 'right' as const },
    { label: 'Gross Pay', width: 70, align: 'right' as const },
    { label: 'SSS EE', width: 55, align: 'right' as const },
    { label: 'PhilHealth', width: 55, align: 'right' as const },
    { label: 'Pag-IBIG', width: 55, align: 'right' as const },
    { label: 'Tax', width: 55, align: 'right' as const },
    { label: 'Total Ded.', width: 65, align: 'right' as const },
    { label: 'Net Pay', width: 70, align: 'right' as const },
  ];

  const rows: (string | number)[][] = [];
  let totals = { basicPay: 0, otPay: 0, nightDiff: 0, holiday: 0, allowances: 0, grossPay: 0, sssEE: 0, philhealth: 0, pagibig: 0, tax: 0, totalDed: 0, netPay: 0 };

  for (const p of payslipResult.recordset) {
    totals.basicPay += p.BasicPay || 0;
    totals.otPay += p.OvertimePay || 0;
    totals.nightDiff += p.NightDiffPay || 0;
    totals.holiday += p.HolidayPay || 0;
    totals.allowances += p.Allowances || 0;
    totals.grossPay += p.GrossPay || 0;
    totals.sssEE += p.SssEmployeeShare || 0;
    totals.philhealth += p.PhilHealthEmployeeShare || 0;
    totals.pagibig += p.PagIbigEmployeeShare || 0;
    totals.tax += p.WithholdingTax || 0;
    totals.totalDed += p.TotalDeductions || 0;
    totals.netPay += p.NetPay || 0;

    rows.push([
      p.EmployeeNo,
      `${p.LastName}, ${p.FirstName}`,
      phCurrency(p.BasicPay || 0),
      phCurrency(p.OvertimePay || 0),
      phCurrency(p.NightDiffPay || 0),
      phCurrency(p.HolidayPay || 0),
      phCurrency(p.Allowances || 0),
      phCurrency(p.GrossPay || 0),
      phCurrency(p.SssEmployeeShare || 0),
      phCurrency(p.PhilHealthEmployeeShare || 0),
      phCurrency(p.PagIbigEmployeeShare || 0),
      phCurrency(p.WithholdingTax || 0),
      phCurrency(p.TotalDeductions || 0),
      phCurrency(p.NetPay || 0),
    ]);
  }

  rows.push([
    '', 'TOTALS',
    phCurrency(totals.basicPay), phCurrency(totals.otPay), phCurrency(totals.nightDiff),
    phCurrency(totals.holiday), phCurrency(totals.allowances), phCurrency(totals.grossPay),
    phCurrency(totals.sssEE), phCurrency(totals.philhealth), phCurrency(totals.pagibig),
    phCurrency(totals.tax), phCurrency(totals.totalDed), phCurrency(totals.netPay),
  ]);

  y = drawTable(doc, headers, rows, y);
  y += 15;

  doc.fontSize(8).font('Helvetica-Bold');
  doc.text(`Total Employees: ${payslipResult.recordset.length}`, 50, y);
  doc.text(`Total Gross Pay: ${phCurrency(totals.grossPay)}`, 250, y);
  doc.text(`Total Deductions: ${phCurrency(totals.totalDed)}`, 450, y);
  doc.text(`Total Net Pay: ${phCurrency(totals.netPay)}`, 650, y);
  y += 20;

  drawLine(doc, y);
  y += 10;

  doc.fontSize(7).font('Helvetica');
  doc.text(`Prepared by: _________________________    Reviewed by: _________________________    Approved by: _________________________`, 50, y);

  addPageNumbers(doc);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
