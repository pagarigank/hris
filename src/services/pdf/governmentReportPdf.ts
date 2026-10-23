import sql from 'mssql';
import { createDoc, drawHeader, drawTable, addPageNumbers, CompanyInfo } from './pdfUtils';

export async function generateGovernmentReportPdf(
  pool: sql.ConnectionPool,
  tenantId: string,
  reportType: string,
  periodCovered: string,
): Promise<Buffer> {
  const tenantResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT CompanyName, Address, TIN, SssEmployerNo, PhilHealthEmployerNo, PagIbigEmployerNo FROM dbo.Tenants WHERE Id = @TenantId`);
  const tenant = tenantResult.recordset[0] as CompanyInfo;
  const company: CompanyInfo = { name: tenant?.name || 'Company', address: tenant?.address, tin: tenant?.tin };

  const reportTitles: Record<string, string> = {
    SSS_R3: 'SSS R-3 CONTRIBUTION REPORT',
    SSS_R5: 'SSS R-5 CONTRIBUTION REPORT',
    PhilHealth_RF1: 'PhilHealth RF-1 CONTRIBUTION REPORT',
    PagIbig_M1A: 'Pag-IBIG M1-A CONTRIBUTION REPORT',
    PagIbig_M2: 'Pag-IBIG M2 CONTRIBUTION REPORT',
    BIR_Alphalist: 'BIR ALPHALIST',
    BIR_1601C: 'BIR 1601-C MONTHLY REMITTANCE',
  };

  const title = reportTitles[reportType] || 'GOVERNMENT REPORT';
  const doc = createDoc(true);
  drawHeader(doc, title, company, `Period: ${periodCovered}`);

  let y = doc.y + 2;
  let headers: { label: string; width: number; align?: 'left' | 'center' | 'right' }[] = [];
  let rows: (string | number)[][] = [];

  if (reportType === 'BIR_Alphalist') {
    headers = [
      { label: 'TIN', width: 80, align: 'center' },
      { label: 'Last Name', width: 100 },
      { label: 'First Name', width: 100 },
      { label: 'Middle Name', width: 100 },
      { label: 'Gross Pay', width: 80, align: 'right' },
      { label: 'Taxable Income', width: 80, align: 'right' },
      { label: 'Withholding Tax', width: 80, align: 'right' },
      { label: 'SSS EE', width: 70, align: 'right' },
      { label: 'PhilHealth EE', width: 70, align: 'right' },
      { label: 'Pag-IBIG EE', width: 70, align: 'right' },
    ];
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT e.TIN, e.FirstName, e.LastName, e.MiddleName,
               p.BasicPay, p.GrossPay, p.WithholdingTax, p.SssEmployeeShare,
               p.PhilHealthEmployeeShare, p.PagIbigEmployeeShare
        FROM dbo.Payslips p
        INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id
        INNER JOIN dbo.PayrollRuns pr ON p.PayrollRunId = pr.Id
        INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
        WHERE p.TenantId = @TenantId AND pp.Status = 'Closed' AND p.IsDeleted = 0
      `);
    for (const r of result.recordset) {
      rows.push([
        r.TIN || '', r.LastName, r.FirstName, r.MiddleName || '',
        `₱${(r.GrossPay || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `₱${((r.GrossPay || 0) - (r.SssEmployeeShare || 0) - (r.PhilHealthEmployeeShare || 0) - (r.PagIbigEmployeeShare || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `₱${(r.WithholdingTax || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `₱${(r.SssEmployeeShare || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `₱${(r.PhilHealthEmployeeShare || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `₱${(r.PagIbigEmployeeShare || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      ]);
    }
  } else if (reportType === 'SSS_R3' || reportType === 'SSS_R5') {
    headers = [
      { label: 'SSS No', width: 90, align: 'center' },
      { label: 'Last Name', width: 120 },
      { label: 'First Name', width: 120 },
      { label: 'Monthly Salary Credit', width: 100, align: 'right' },
      { label: 'EE Contribution', width: 90, align: 'right' },
      { label: 'ER Contribution', width: 90, align: 'right' },
    ];
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT e.SssNo, e.FirstName, e.LastName, p.SssEmployeeShare, p.SssEmployerShare
        FROM dbo.Payslips p
        INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id
        INNER JOIN dbo.PayrollRuns pr ON p.PayrollRunId = pr.Id
        INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
        WHERE p.TenantId = @TenantId AND pp.Status = 'Closed' AND p.IsDeleted = 0
      `);
    for (const r of result.recordset) {
      rows.push([
        r.SssNo || '', r.LastName, r.FirstName, '',
        `₱${(r.SssEmployeeShare || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `₱${(r.SssEmployerShare || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      ]);
    }
  } else if (reportType === 'PhilHealth_RF1') {
    headers = [
      { label: 'PhilHealth No', width: 100, align: 'center' },
      { label: 'Last Name', width: 130 },
      { label: 'First Name', width: 130 },
      { label: 'EE Contribution', width: 100, align: 'right' },
      { label: 'ER Contribution', width: 100, align: 'right' },
    ];
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT e.PhilHealthNo, e.FirstName, e.LastName, p.PhilHealthEmployeeShare, p.PhilHealthEmployerShare
        FROM dbo.Payslips p
        INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id
        INNER JOIN dbo.PayrollRuns pr ON p.PayrollRunId = pr.Id
        INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
        WHERE p.TenantId = @TenantId AND pp.Status = 'Closed' AND p.IsDeleted = 0
      `);
    for (const r of result.recordset) {
      rows.push([
        r.PhilHealthNo || '', r.LastName, r.FirstName,
        `₱${(r.PhilHealthEmployeeShare || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `₱${(r.PhilHealthEmployerShare || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      ]);
    }
  } else if (reportType === 'PagIbig_M1A' || reportType === 'PagIbig_M2') {
    headers = [
      { label: 'Pag-IBIG No', width: 100, align: 'center' },
      { label: 'Last Name', width: 130 },
      { label: 'First Name', width: 130 },
      { label: 'EE Contribution', width: 100, align: 'right' },
      { label: 'ER Contribution', width: 100, align: 'right' },
    ];
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT e.PagIbigNo, e.FirstName, e.LastName, p.PagIbigEmployeeShare, p.PagIbigEmployerShare
        FROM dbo.Payslips p
        INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id
        INNER JOIN dbo.PayrollRuns pr ON p.PayrollRunId = pr.Id
        INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
        WHERE p.TenantId = @TenantId AND pp.Status = 'Closed' AND p.IsDeleted = 0
      `);
    for (const r of result.recordset) {
      rows.push([
        r.PagIbigNo || '', r.LastName, r.FirstName,
        `₱${(r.PagIbigEmployeeShare || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `₱${(r.PagIbigEmployerShare || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      ]);
    }
  } else if (reportType === 'BIR_1601C') {
    headers = [
      { label: 'TIN', width: 100, align: 'center' },
      { label: 'Last Name', width: 130 },
      { label: 'First Name', width: 130 },
      { label: 'Withholding Tax', width: 100, align: 'right' },
    ];
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT e.TIN, e.FirstName, e.LastName, p.WithholdingTax
        FROM dbo.Payslips p
        INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id
        INNER JOIN dbo.PayrollRuns pr ON p.PayrollRunId = pr.Id
        INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
        WHERE p.TenantId = @TenantId AND pp.Status = 'Closed' AND p.IsDeleted = 0
      `);
    let totalTax = 0;
    for (const r of result.recordset) {
      totalTax += r.WithholdingTax || 0;
      rows.push([
        r.TIN || '', r.LastName, r.FirstName,
        `₱${(r.WithholdingTax || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      ]);
    }
    rows.push(['', '', 'TOTAL', `₱${totalTax.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`]);
  }

  y = drawTable(doc, headers, rows, y);
  y += 15;

  doc.fontSize(7).font('Helvetica');
  doc.text(`Employer: ${company.name}  |  TIN: ${company.tin || 'N/A'}  |  SSS No: ${tenant?.sssEmployerNo || 'N/A'}  |  PhilHealth No: ${tenant?.philHealthEmployerNo || 'N/A'}  |  Pag-IBIG No: ${tenant?.pagIbigEmployerNo || 'N/A'}`, 50, y);

  addPageNumbers(doc);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
