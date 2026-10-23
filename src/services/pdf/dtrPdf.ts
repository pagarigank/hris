import sql from 'mssql';
import { createDoc, drawHeader, drawTable, drawLine, addPageNumbers, CompanyInfo } from './pdfUtils';

export async function generateDtrPdf(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeId: string,
  month: number,
  year: number,
): Promise<Buffer> {
  const empResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('EmployeeId', sql.UniqueIdentifier, employeeId)
    .query(`
      SELECT e.EmployeeNo, e.FirstName, e.MiddleName, e.LastName,
             d.Name AS Department, pos.Title AS Position
      FROM dbo.Employees e
      LEFT JOIN dbo.Departments d ON e.DepartmentId = d.Id
      LEFT JOIN dbo.Positions pos ON e.PositionId = pos.Id
      WHERE e.Id = @EmployeeId AND e.TenantId = @TenantId AND e.IsDeleted = 0
    `);

  if (!empResult.recordset.length) throw new Error('Employee not found');
  const emp = empResult.recordset[0];

  const dtrResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('EmployeeId', sql.UniqueIdentifier, employeeId)
    .input('Month', sql.Int, month)
    .input('Year', sql.Int, year)
    .query(`
      SELECT d.WorkDate, d.ActualTimeIn, d.ActualTimeOut, d.LateMinutes,
             d.UndertimeMinutes, d.OvertimeMinutes, d.NightDiffMinutes, d.Status,
             d.ScheduledTimeIn, d.ScheduledTimeOut
      FROM dbo.DailyTimeRecords d
      WHERE d.TenantId = @TenantId AND d.EmployeeId = @EmployeeId
        AND MONTH(d.WorkDate) = @Month AND YEAR(d.WorkDate) = @Year
        AND d.IsDeleted = 0
      ORDER BY d.WorkDate
    `);

  const tenantResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`SELECT CompanyName, Address FROM dbo.Tenants WHERE Id = @TenantId`);
  const tenant = tenantResult.recordset[0] as CompanyInfo;

  const doc = createDoc(true);
  const monthName = new Date(year, month - 1).toLocaleString('en-PH', { month: 'long' });
  drawHeader(doc, 'DAILY TIME RECORD (DTR)', tenant, `${emp.LastName}, ${emp.FirstName} ${emp.MiddleName || ''} | ${monthName} ${year}`);

  let y = doc.y + 2;
  doc.fontSize(8).font('Helvetica-Bold');
  doc.text(`Employee No: ${emp.EmployeeNo}`, 50, y);
  doc.text(`Department: ${emp.Department || 'N/A'}`, 300, y);
  doc.text(`Position: ${emp.Position || 'N/A'}`, 550, y);
  y += 20;

  const tableWidth = doc.page.width - 100;
  const headers = [
    { label: 'Date', width: 60, align: 'center' as const },
    { label: 'Day', width: 40, align: 'center' as const },
    { label: 'Scheduled In', width: 65, align: 'center' as const },
    { label: 'Scheduled Out', width: 65, align: 'center' as const },
    { label: 'Actual In', width: 65, align: 'center' as const },
    { label: 'Actual Out', width: 65, align: 'center' as const },
    { label: 'Late (min)', width: 55, align: 'center' as const },
    { label: 'Undertime (min)', width: 70, align: 'center' as const },
    { label: 'OT (min)', width: 50, align: 'center' as const },
    { label: 'Night Diff (min)', width: 75, align: 'center' as const },
    { label: 'Hours Worked', width: 70, align: 'center' as const },
    { label: 'Status', width: 80, align: 'center' as const },
  ];

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const rows: (string | number)[][] = [];
  let totalLate = 0, totalUndertime = 0, totalOT = 0, totalNightDiff = 0, totalHours = 0;

  for (const d of dtrResult.recordset) {
    const workDate = new Date(d.WorkDate);
    const dayName = days[workDate.getDay()];
    const hoursWorked = d.ActualTimeIn && d.ActualTimeOut
      ? ((new Date(d.ActualTimeOut).getTime() - new Date(d.ActualTimeIn).getTime()) / 3600000).toFixed(2)
      : '0.00';

    totalLate += d.LateMinutes || 0;
    totalUndertime += d.UndertimeMinutes || 0;
    totalOT += d.OvertimeMinutes || 0;
    totalNightDiff += d.NightDiffMinutes || 0;
    totalHours += parseFloat(hoursWorked);

    rows.push([
      workDate.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit' }),
      dayName,
      d.ScheduledTimeIn ? new Date(d.ScheduledTimeIn).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '-',
      d.ScheduledTimeOut ? new Date(d.ScheduledTimeOut).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '-',
      d.ActualTimeIn ? new Date(d.ActualTimeIn).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '-',
      d.ActualTimeOut ? new Date(d.ActualTimeOut).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '-',
      d.LateMinutes || 0,
      d.UndertimeMinutes || 0,
      d.OvertimeMinutes || 0,
      d.NightDiffMinutes || 0,
      hoursWorked,
      d.Status || 'N/A',
    ]);
  }

  rows.push([
    '', '', '', '', '', '', '', '', '', '', '', '',
  ]);
  rows.push([
    '', '', '', 'TOTALS', '', '',
    totalLate, totalUndertime, totalOT, totalNightDiff, totalHours.toFixed(2), '',
  ]);

  y = drawTable(doc, headers, rows, y);
  y += 20;

  doc.fontSize(8).font('Helvetica');
  doc.text(`Prepared by: _________________________    Reviewed by: _________________________    Approved by: _________________________`, 50, y);
  y += 20;
  doc.text(`Employee Signature: _________________________    Date: _________________________`, 50, y);

  addPageNumbers(doc);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
