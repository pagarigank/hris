import sql from 'mssql';
import { createDoc, drawHeader, drawTable, drawLine, drawKeyValue, addPageNumbers, phCurrency, CompanyInfo } from './pdfUtils';

interface PayslipData {
  EmployeeNo: string;
  FirstName: string;
  MiddleName?: string;
  LastName: string;
  Department?: string;
  Position?: string;
  PayFrequency: string;
  PeriodStart: string;
  PeriodEnd: string;
  PayDate: string;
  BasicPay: number;
  TotalWorkedDays: number;
  AbsentDeduction: number;
  LateDeduction: number;
  UndertimeDeduction: number;
  OvertimePay: number;
  NightDiffPay: number;
  HolidayPay: number;
  RestDayPremium: number;
  Allowances: number;
  DeMinimisBenefits: number;
  GrossPay: number;
  SssEmployeeShare: number;
  SssEmployerShare: number;
  SssMPFEmployer: number;
  PhilHealthEmployeeShare: number;
  PhilHealthEmployerShare: number;
  PagIbigEmployeeShare: number;
  PagIbigEmployerShare: number;
  GsisEmployeeShare: number;
  GsisEmployerShare: number;
  GsisECShare: number;
  PeraEmployeeShare: number;
  PeraEmployerShare: number;
  WithholdingTax: number;
  LoanDeductions: number;
  OtherDeductions: number;
  TotalDeductions: number;
  NetPay: number;
}

export async function generatePayslipPdf(
  pool: sql.ConnectionPool,
  tenantId: string,
  payslipId: string,
): Promise<Buffer> {
  const result = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('Id', sql.UniqueIdentifier, payslipId)
    .query(`
      SELECT p.*, e.EmployeeNo, e.FirstName, e.MiddleName, e.LastName,
             d.Name AS Department, pos.Title AS Position,
             pp.PeriodStart, pp.PeriodEnd, pp.PayDate, pp.PayFrequency
      FROM dbo.Payslips p
      INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id
      LEFT JOIN dbo.Departments d ON e.DepartmentId = d.Id
      LEFT JOIN dbo.Positions pos ON e.PositionId = pos.Id
      INNER JOIN dbo.PayrollRuns pr ON p.PayrollRunId = pr.Id
      INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
      WHERE p.Id = @Id AND p.TenantId = @TenantId AND p.IsDeleted = 0
    `);

  if (!result.recordset.length) throw new Error('Payslip not found');
  const p = result.recordset[0] as PayslipData;

  const tenantResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT CompanyName, Address, TIN, SssEmployerNo, PhilHealthEmployerNo, PagIbigEmployerNo, GsisEmployerNo, IsGovernment FROM dbo.Tenants WHERE Id = @TenantId`);
  const tenant = tenantResult.recordset[0] as CompanyInfo;

  const company: CompanyInfo = {
    name: tenant?.name || 'Company',
    address: tenant?.address,
    tin: tenant?.tin,
  };

  const doc = createDoc(false);

  drawHeader(doc, 'PAYSLIP', company, `${p.PeriodStart} to ${p.PeriodEnd} | Pay Date: ${p.PayDate}`);

  let y = doc.y + 5;

  // Employee info
  doc.fontSize(8).font('Helvetica-Bold');
  doc.text('Employee:', 50, y);
  doc.font('Helvetica').text(`${p.LastName}, ${p.FirstName} ${p.MiddleName || ''}`, 130, y);
  doc.font('Helvetica-Bold').text('Employee No:', 350, y);
  doc.font('Helvetica').text(p.EmployeeNo, 430, y);
  y += 14;
  doc.font('Helvetica-Bold').text('Department:', 50, y);
  doc.font('Helvetica').text(p.Department || 'N/A', 130, y);
  doc.font('Helvetica-Bold').text('Pay Frequency:', 350, y);
  doc.font('Helvetica').text(p.PayFrequency, 430, y);
  y += 14;
  doc.font('Helvetica-Bold').text('Position:', 50, y);
  doc.font('Helvetica').text(p.Position || 'N/A', 130, y);
  doc.font('Helvetica-Bold').text('Days Worked:', 350, y);
  doc.font('Helvetica').text(String(p.TotalWorkedDays), 430, y);
  y += 20;

  drawLine(doc, y);
  y += 10;

  // Earnings
  doc.fontSize(10).font('Helvetica-Bold').text('EARNINGS', 50, y);
  y += 16;
  const earningsHeaders = [
    { label: 'Description', width: 300 },
    { label: 'Amount', width: 120, align: 'right' as const },
  ];
  const earningsRows: (string | number)[][] = [];
  if (p.BasicPay > 0) earningsRows.push(['Basic Pay', phCurrency(p.BasicPay)]);
  if (p.OvertimePay > 0) earningsRows.push(['Overtime Pay', phCurrency(p.OvertimePay)]);
  if (p.NightDiffPay > 0) earningsRows.push(['Night Differential', phCurrency(p.NightDiffPay)]);
  if (p.HolidayPay > 0) earningsRows.push(['Holiday Pay', phCurrency(p.HolidayPay)]);
  if (p.RestDayPremium > 0) earningsRows.push(['Rest Day Premium', phCurrency(p.RestDayPremium)]);
  if (p.Allowances > 0) earningsRows.push(['Allowances', phCurrency(p.Allowances)]);
  if (p.DeMinimisBenefits > 0) earningsRows.push(['De Minimis Benefits', phCurrency(p.DeMinimisBenefits)]);
  y = drawTable(doc, earningsHeaders, earningsRows, y);
  y += 4;
  doc.font('Helvetica-Bold').text('TOTAL EARNINGS:', 50, y, { width: 300, align: 'right' });
  doc.text(phCurrency(p.GrossPay), 350, y, { width: 120, align: 'right' });
  y += 18;

  drawLine(doc, y);
  y += 10;

  // Deductions
  doc.fontSize(10).font('Helvetica-Bold').text('DEDUCTIONS', 50, y);
  y += 16;
  const deductionsHeaders = [
    { label: 'Description', width: 300 },
    { label: 'Amount', width: 120, align: 'right' as const },
  ];
  const deductionsRows: (string | number)[][] = [];
  if (p.AbsentDeduction > 0) deductionsRows.push(['Absent Deduction', phCurrency(p.AbsentDeduction)]);
  if (p.LateDeduction > 0) deductionsRows.push(['Late Deduction', phCurrency(p.LateDeduction)]);
  if (p.UndertimeDeduction > 0) deductionsRows.push(['Undertime Deduction', phCurrency(p.UndertimeDeduction)]);
  if (p.SssEmployeeShare > 0) deductionsRows.push(['SSS (Employee Share)', phCurrency(p.SssEmployeeShare)]);
  if (p.GsisEmployeeShare > 0) deductionsRows.push(['GSIS Premium (Employee Share)', phCurrency(p.GsisEmployeeShare)]);
  if (p.PhilHealthEmployeeShare > 0) deductionsRows.push(['PhilHealth (Employee Share)', phCurrency(p.PhilHealthEmployeeShare)]);
  if (p.PagIbigEmployeeShare > 0) deductionsRows.push(['Pag-IBIG (Employee Share)', phCurrency(p.PagIbigEmployeeShare)]);
  if (p.WithholdingTax > 0) deductionsRows.push(['Withholding Tax', phCurrency(p.WithholdingTax)]);
  if (p.PeraEmployeeShare > 0) deductionsRows.push(['PERA Contribution (Employee Share)', phCurrency(p.PeraEmployeeShare)]);
  if (p.LoanDeductions > 0) deductionsRows.push(['Loan Deductions', phCurrency(p.LoanDeductions)]);
  if (p.OtherDeductions > 0) deductionsRows.push(['Other Deductions', phCurrency(p.OtherDeductions)]);
  y = drawTable(doc, deductionsHeaders, deductionsRows, y);
  y += 4;
  doc.font('Helvetica-Bold').text('TOTAL DEDUCTIONS:', 50, y, { width: 300, align: 'right' });
  doc.text(phCurrency(p.TotalDeductions), 350, y, { width: 120, align: 'right' });
  y += 20;

  drawLine(doc, y);
  y += 10;

  // Net Pay
  doc.fontSize(12).font('Helvetica-Bold').text('NET PAY:', 50, y, { width: 300, align: 'right' });
  doc.text(phCurrency(p.NetPay), 350, y, { width: 120, align: 'right' });
  y += 25;

  // Employer contributions (for reference)
  drawLine(doc, y);
  y += 10;
  doc.fontSize(8).font('Helvetica-Bold').text('EMPLOYER CONTRIBUTIONS (for reference)', 50, y);
  y += 14;
  doc.fontSize(7).font('Helvetica');
  const employerRefParts: string[] = [];
  if (p.SssEmployerShare > 0) employerRefParts.push(`SSS Employer: ${phCurrency(p.SssEmployerShare)}`);
  if (p.GsisEmployerShare > 0) employerRefParts.push(`GSIS Employer: ${phCurrency(p.GsisEmployerShare)}`);
  if (p.GsisECShare > 0) employerRefParts.push(`GSIS EC: ${phCurrency(p.GsisECShare)}`);
  if (p.PeraEmployerShare > 0) employerRefParts.push(`PERA Employer Match: ${phCurrency(p.PeraEmployerShare)}`);
  employerRefParts.push(`PhilHealth Employer: ${phCurrency(p.PhilHealthEmployerShare)}`);
  employerRefParts.push(`Pag-IBIG Employer: ${phCurrency(p.PagIbigEmployerShare)}`);
  doc.text(employerRefParts.join('  |  '), 50, y);
  y += 16;
  const totalEmployerCost = p.GrossPay + p.SssEmployerShare + p.SssMPFEmployer + p.GsisEmployerShare + p.GsisECShare + p.PeraEmployerShare + p.PhilHealthEmployerShare + p.PagIbigEmployerShare;
  doc.text(`Total Employer Cost: ${phCurrency(totalEmployerCost)}`, 50, y);

  addPageNumbers(doc);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
