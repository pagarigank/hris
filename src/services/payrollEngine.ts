import sql from 'mssql';

export interface ContributionBracket {
  Id: number;
  EffectiveYear: number;
  TableType: string;
  BracketMin: number;
  BracketMax: number;
  EmployeeShare: number | null;
  EmployerShare: number | null;
  FixedAmount: number | null;
  RatePercent: number | null;
  Description: string;
}

export interface EmployeePayInput {
  EmployeeId: string;
  BasicSalary: number;
  PayFrequency: string;
  DaysWorked: number;
  LateMinutes: number;
  UndertimeMinutes: number;
  OvertimeMinutes: number;
  NightDiffMinutes: number;
  HolidayPayDays: number;
  RestDayPayDays: number;
  IsRegularHoliday: boolean;
  IsSpecialNonWorkingDay: boolean;
  Allowances?: number;
  DeMinimisBenefits?: number;
}

export interface LoanBreakdownItem {
  LoanType: string;
  Description: string;
  Amount: number;
}

export interface PayslipResult {
  EmployeeId: string;
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
  SssMPFEmployee: number;
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
  ThirteenthMonthPayAccrual: number;
  LoanDeductions: number;
  LoanBreakdown: LoanBreakdownItem[];
  OtherDeductions: number;
  TotalDeductions: number;
  NetPay: number;
}

export interface PayslipLineItem {
  ItemType: string;
  Code: string;
  Description: string;
  Amount: number;
}

export interface ThirteenthMonthRecord {
  EmployeeId: string;
  Year: number;
  TotalBasicSalaryEarned: number;
  ComputedAmount: number;
}

const DEFAULT_WORKING_DAYS_PER_YEAR = Number(process.env.WORKING_DAYS_PER_YEAR) || 261;

export function getWorkingDaysPerYear(tenantWorkingDays?: number): number {
  return tenantWorkingDays || DEFAULT_WORKING_DAYS_PER_YEAR;
}

export function getWorkingDaysPerMonth(payFrequency: string, workingDaysPerYear?: number): number {
  const wd = getWorkingDaysPerYear(workingDaysPerYear);
  switch (payFrequency) {
    case 'Monthly': return wd / 12;
    case 'SemiMonthly': return wd / 24;
    case 'Weekly': return wd / 52;
    case 'Daily': return 1;
    default: return wd / 12;
  }
}

export function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeDailyRate(monthlySalary: number, workingDaysPerYear?: number): number {
  return (monthlySalary * 12) / getWorkingDaysPerYear(workingDaysPerYear);
}

export function computeHourlyRate(dailyRate: number): number {
  return dailyRate / 8;
}

export function computeAbsentDeduction(dailyRate: number, absentDays: number): number {
  return roundTo2(dailyRate * absentDays);
}

export function computeLateDeduction(hourlyRate: number, lateMinutes: number): number {
  return roundTo2((hourlyRate / 60) * lateMinutes);
}

export function computeUndertimeDeduction(hourlyRate: number, undertimeMinutes: number): number {
  return roundTo2((hourlyRate / 60) * undertimeMinutes);
}

export function computeOvertimePay(hourlyRate: number, overtimeMinutes: number, multiplier = 1.25): number {
  return roundTo2(hourlyRate * multiplier * (overtimeMinutes / 60));
}

export function computeNightDiffPay(hourlyRate: number, nightDiffMinutes: number, rate = 0.10): number {
  return roundTo2(hourlyRate * rate * (nightDiffMinutes / 60));
}

export function computeHolidayPay(dailyRate: number, workedDays: number, multiplier = 2.00): number {
  return roundTo2(dailyRate * workedDays * multiplier);
}

export function computeRestDayPremium(dailyRate: number, workedDays: number, multiplier = 1.30): number {
  return roundTo2(dailyRate * workedDays * multiplier);
}

export function lookupSSS(brackets: ContributionBracket[], monthlySalaryCredit: number): { employeeShare: number; employerShare: number } {
  const msc = Math.min(Math.max(monthlySalaryCredit, 3250), 25000);
  const bracket = brackets.find(b => msc >= b.BracketMin && msc < b.BracketMax && b.EmployeeShare !== null);
  if (bracket) {
    return { employeeShare: bracket.EmployeeShare!, employerShare: bracket.EmployerShare! };
  }
  const maxBracket = brackets.filter(b => b.EmployeeShare !== null).sort((a, b) => b.BracketMax - a.BracketMax)[0];
  return { employeeShare: maxBracket?.EmployeeShare || 0, employerShare: maxBracket?.EmployerShare || 0 };
}

export function computeSSSMPF(brackets: ContributionBracket[], monthlySalaryCredit: number): { employeeShare: number; employerShare: number } {
  const mpfBracket = brackets.find(b => b.TableType === 'SSS' && b.Description?.toLowerCase().includes('mpf'));
  if (!mpfBracket || !mpfBracket.RatePercent) return { employeeShare: 0, employerShare: 0 };
  const mpfThreshold = mpfBracket.BracketMin;
  if (monthlySalaryCredit <= mpfThreshold) return { employeeShare: 0, employerShare: 0 };
  const mpfable = monthlySalaryCredit - mpfThreshold;
  const rate = mpfBracket.RatePercent / 100;
  return {
    employeeShare: roundTo2(mpfable * rate),
    employerShare: roundTo2(mpfable * rate),
  };
}

export function lookupPhilHealth(brackets: ContributionBracket[], monthlyBasicSalary: number): { employeeShare: number; employerShare: number } {
  const rateBracket = brackets.find(b => b.RatePercent !== null);
  const minBracket = brackets.find(b => b.Description?.includes('Minimum'));
  const maxBracket = brackets.find(b => b.Description?.includes('Maximum'));

  if (!rateBracket) return { employeeShare: 0, employerShare: 0 };

  const rate = rateBracket.RatePercent! / 100;
  const floor = 10000;
  const ceiling = 100000;
  const clampedSalary = Math.min(Math.max(monthlyBasicSalary, floor), ceiling);
  const perSide = clampedSalary * rate;

  const minContribution = minBracket?.EmployeeShare || 250;
  const maxContribution = maxBracket?.EmployeeShare || 2500;

  const clampedContribution = Math.min(Math.max(perSide, minContribution), maxContribution);
  return { employeeShare: roundTo2(clampedContribution), employerShare: roundTo2(clampedContribution) };
}

export function lookupPagIbig(brackets: ContributionBracket[], monthlyBasicSalary: number): { employeeShare: number; employerShare: number } {
  const standardBracket = brackets.find(b => b.EmployeeShare !== null && b.RatePercent === null && b.Description?.includes('Standard'));
  const maxBracket = brackets.find(b => b.Description?.includes('Maximum'));

  if (!standardBracket) return { employeeShare: 0, employerShare: 0 };

  const maxContribution = maxBracket?.EmployeeShare || 200;
  const rate = 0.02;
  const contribution = Math.min(roundTo2(monthlyBasicSalary * rate), maxContribution);

  return { employeeShare: contribution, employerShare: contribution };
}

export function lookupGSIS(brackets: ContributionBracket[], monthlyBasicSalary: number): { employeeShare: number; employerShare: number; ecShare: number } {
  const gsisBrackets = brackets.filter(b => b.TableType === 'GSIS');
  const gsisEcBrackets = brackets.filter(b => b.TableType === 'GSIS_EC');

  if (gsisBrackets.length === 0) return { employeeShare: 0, employerShare: 0, ecShare: 0 };

  const clampedSalary = Math.min(Math.max(monthlyBasicSalary, 5000), 25000);

  const bracket = gsisBrackets.find(b => clampedSalary >= b.BracketMin && clampedSalary < b.BracketMax);
  let employeeShare = 0;
  let employerShare = 0;

  if (bracket) {
    if (bracket.RatePercent) {
      employeeShare = roundTo2(clampedSalary * (bracket.RatePercent / 100));
      employerShare = roundTo2(clampedSalary * (bracket.RatePercent / 100));
    } else {
      employeeShare = bracket.EmployeeShare || 0;
      employerShare = bracket.EmployerShare || 0;
    }
  } else {
    const maxBracket = gsisBrackets.filter(b => b.RatePercent !== null || b.EmployeeShare !== null)
      .sort((a, b) => b.BracketMax - a.BracketMax)[0];
    if (maxBracket) {
      if (maxBracket.RatePercent) {
        employeeShare = roundTo2(clampedSalary * (maxBracket.RatePercent / 100));
        employerShare = roundTo2(clampedSalary * (maxBracket.RatePercent / 100));
      } else {
        employeeShare = maxBracket.EmployeeShare || 0;
        employerShare = maxBracket.EmployerShare || 0;
      }
    }
  }

  let ecShare = 0;
  if (gsisEcBrackets.length > 0) {
    const ecBracket = gsisEcBrackets.find(b => clampedSalary >= b.BracketMin && clampedSalary < b.BracketMax);
    if (ecBracket) {
      if (ecBracket.RatePercent) {
        ecShare = roundTo2(clampedSalary * (ecBracket.RatePercent / 100));
      } else {
        ecShare = ecBracket.EmployerShare || 0;
      }
    } else {
      const maxEcBracket = gsisEcBrackets.filter(b => b.RatePercent !== null || b.EmployerShare !== null)
        .sort((a, b) => b.BracketMax - a.BracketMax)[0];
      if (maxEcBracket) {
        if (maxEcBracket.RatePercent) {
          ecShare = roundTo2(clampedSalary * (maxEcBracket.RatePercent / 100));
        } else {
          ecShare = maxEcBracket.EmployerShare || 0;
        }
      }
    }
  }

  return { employeeShare, employerShare, ecShare };
}

export function lookupWithholdingTax(brackets: ContributionBracket[], taxableIncome: number): number {
  const sortedBrackets = [...brackets].sort((a, b) => a.BracketMin - b.BracketMin);
  for (const bracket of sortedBrackets) {
    if (taxableIncome >= bracket.BracketMin && taxableIncome < bracket.BracketMax) {
      const fixedAmount = bracket.FixedAmount || 0;
      const ratePercent = bracket.RatePercent || 0;
      return roundTo2(fixedAmount + (ratePercent / 100) * (taxableIncome - bracket.BracketMin));
    }
  }
  const highestBracket = sortedBrackets[sortedBrackets.length - 1];
  if (highestBracket) {
    return roundTo2((highestBracket.FixedAmount || 0) + (highestBracket.RatePercent || 0) / 100 * (taxableIncome - highestBracket.BracketMin));
  }
  return 0;
}

export function computeDeMinimisBenefits(allowances: number, deMinimisBrackets?: ContributionBracket[]): number {
  let totalCeiling = 8000;
  if (deMinimisBrackets && deMinimisBrackets.length > 0) {
    totalCeiling = deMinimisBrackets.reduce((sum, b) => sum + (b.FixedAmount || 0), 0);
  }
  return roundTo2(Math.min(allowances, totalCeiling));
}

/**
 * Human-readable labels for loan types.
 * Used in payslip line items and government reports.
 */
export const LOAN_TYPE_LABELS: Record<string, string> = {
  'SSS': 'SSS Salary Loan',
  'PagIbig': 'Pag-IBIG Multipurpose Loan',
  'GSIS_Conso': 'GSIS Consolidated Loan',
  'GSIS_Policy': 'GSIS Policy Loan',
  'GSIS_Enhanced': 'GSIS Enhanced Salary Loan',
  'GSIS_Emergency': 'GSIS Emergency Loan',
  'CompanyLoan': 'Company Loan',
  'Other': 'Other Loan',
};

/**
 * Deduction codes for payslip line items, per loan type.
 * Maps to PayslipLineItem.Code values.
 */
export const LOAN_TYPE_CODES: Record<string, string> = {
  'SSS': 'LOAN_SSS',
  'PagIbig': 'LOAN_PAGIBIG',
  'GSIS_Conso': 'LOAN_GSIS_CONSO',
  'GSIS_Policy': 'LOAN_GSIS_POLICY',
  'GSIS_Enhanced': 'LOAN_GSIS_ENHANCED',
  'GSIS_Emergency': 'LOAN_GSIS_EMERGENCY',
  'CompanyLoan': 'LOAN_COMPANY',
  'Other': 'LOAN_OTHER',
};

export function computeLoanDeductions(
  loans: { MonthlyAmortization: number; RemainingBalance: number; LoanType?: string }[]
): { totalDeduction: number; loanDetails: { amortization: number; remainingBalance: number; loanType: string }[]; breakdown: LoanBreakdownItem[] } {
  let totalDeduction = 0;
  const loanDetails: { amortization: number; remainingBalance: number; loanType: string }[] = [];
  const byType = new Map<string, number>();

  for (const loan of loans) {
    if (loan.RemainingBalance > 0) {
      const deduction = Math.min(loan.MonthlyAmortization, loan.RemainingBalance);
      totalDeduction += deduction;
      const loanType = loan.LoanType || 'Other';
      loanDetails.push({
        amortization: roundTo2(deduction),
        remainingBalance: roundTo2(loan.RemainingBalance - deduction),
        loanType,
      });
      byType.set(loanType, (byType.get(loanType) || 0) + deduction);
    }
  }

  // Build per-type breakdown for payslip line items
  const breakdown: LoanBreakdownItem[] = [];
  for (const [loanType, amount] of byType) {
    breakdown.push({
      LoanType: loanType,
      Description: LOAN_TYPE_LABELS[loanType] || loanType,
      Amount: roundTo2(amount),
    });
  }

  return { totalDeduction: roundTo2(totalDeduction), loanDetails, breakdown };
}

export function compute13thMonthPay(totalBasicSalaryEarned: number): ThirteenthMonthRecord & { ComputedAmount: number } {
  const computedAmount = roundTo2(totalBasicSalaryEarned / 12);
  return {
    EmployeeId: '',
    Year: new Date().getFullYear(),
    TotalBasicSalaryEarned: roundTo2(totalBasicSalaryEarned),
    ComputedAmount: computedAmount,
  };
}

export function generatePayslipLineItems(payslip: PayslipResult): PayslipLineItem[] {
  const items: PayslipLineItem[] = [];

  if (payslip.BasicPay > 0) {
    items.push({ ItemType: 'Earning', Code: 'BASIC_PAY', Description: 'Basic Pay', Amount: payslip.BasicPay });
  }
  if (payslip.OvertimePay > 0) {
    items.push({ ItemType: 'Earning', Code: 'OT_PAY', Description: 'Overtime Pay', Amount: payslip.OvertimePay });
  }
  if (payslip.NightDiffPay > 0) {
    items.push({ ItemType: 'Earning', Code: 'NIGHT_DIFF', Description: 'Night Differential', Amount: payslip.NightDiffPay });
  }
  if (payslip.HolidayPay > 0) {
    items.push({ ItemType: 'Earning', Code: 'HOLIDAY_PAY', Description: 'Holiday Pay', Amount: payslip.HolidayPay });
  }
  if (payslip.RestDayPremium > 0) {
    items.push({ ItemType: 'Earning', Code: 'REST_DAY_PREM', Description: 'Rest Day Premium', Amount: payslip.RestDayPremium });
  }
  if (payslip.Allowances > 0) {
    items.push({ ItemType: 'Earning', Code: 'ALLOWANCES', Description: 'Allowances', Amount: payslip.Allowances });
  }

  if (payslip.AbsentDeduction > 0) {
    items.push({ ItemType: 'Deduction', Code: 'ABSENT', Description: 'Absent Deduction', Amount: payslip.AbsentDeduction });
  }
  if (payslip.LateDeduction > 0) {
    items.push({ ItemType: 'Deduction', Code: 'LATE', Description: 'Late Deduction', Amount: payslip.LateDeduction });
  }
  if (payslip.UndertimeDeduction > 0) {
    items.push({ ItemType: 'Deduction', Code: 'UNDERTIME', Description: 'Undertime Deduction', Amount: payslip.UndertimeDeduction });
  }
  if (payslip.SssEmployeeShare > 0) {
    items.push({ ItemType: 'Deduction', Code: 'SSS_EE', Description: 'SSS (Employee Share)', Amount: payslip.SssEmployeeShare });
  }
  if (payslip.SssMPFEmployee > 0) {
    items.push({ ItemType: 'Deduction', Code: 'SSS_MPF_EE', Description: 'SSS MPF (Employee)', Amount: payslip.SssMPFEmployee });
  }
  if (payslip.GsisEmployeeShare > 0) {
    items.push({ ItemType: 'Deduction', Code: 'GSIS_EE', Description: 'GSIS Premium (Employee Share)', Amount: payslip.GsisEmployeeShare });
  }
  if (payslip.PhilHealthEmployeeShare > 0) {
    items.push({ ItemType: 'Deduction', Code: 'PHILHEALTH_EE', Description: 'PhilHealth (Employee Share)', Amount: payslip.PhilHealthEmployeeShare });
  }
  if (payslip.PagIbigEmployeeShare > 0) {
    items.push({ ItemType: 'Deduction', Code: 'PAGIBIG_EE', Description: 'Pag-IBIG (Employee Share)', Amount: payslip.PagIbigEmployeeShare });
  }
  if (payslip.WithholdingTax > 0) {
    items.push({ ItemType: 'Deduction', Code: 'WHTAX', Description: 'Withholding Tax', Amount: payslip.WithholdingTax });
  }
  // Emit per-loan-type line items (GSIS, SSS, PagIBIG, Company, Other)
  if (payslip.LoanBreakdown && payslip.LoanBreakdown.length > 0) {
    for (const loan of payslip.LoanBreakdown) {
      if (loan.Amount > 0) {
        items.push({
          ItemType: 'Deduction',
          Code: LOAN_TYPE_CODES[loan.LoanType] || 'LOAN_OTHER',
          Description: loan.Description,
          Amount: loan.Amount,
        });
      }
    }
  } else if (payslip.LoanDeductions > 0) {
    // Fallback: single line item if breakdown not available
    items.push({ ItemType: 'Deduction', Code: 'LOANS', Description: 'Loan Deductions', Amount: payslip.LoanDeductions });
  }
  if (payslip.PeraEmployeeShare > 0) {
    items.push({ ItemType: 'Deduction', Code: 'PERA_EE', Description: 'PERA Contribution (Employee Share)', Amount: payslip.PeraEmployeeShare });
  }
  if (payslip.PeraEmployerShare > 0) {
    items.push({ ItemType: 'Deduction', Code: 'PERA_ER', Description: 'PERA Employer Match (for reference)', Amount: payslip.PeraEmployerShare });
  }

  return items;
}

export async function generateGovernmentReport(
  pool: sql.ConnectionPool,
  tenantId: string,
  reportType: string,
  periodCovered: string,
  payrollPeriodId?: string
): Promise<{ reportId: string; fileUrl: string }> {
  const reportId = `RPT-${Date.now()}`;
  const fileUrl = `/${tenantId}/reports/${reportType}_${periodCovered.replace(/[^a-zA-Z0-9]/g, '-')}.csv`;

  let reportData: string[][] = [];

  if (reportType === 'BIR_Alphalist') {
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
    reportData = [
      ['TIN', 'Last Name', 'First Name', 'Middle Name', 'Gross Pay', 'Taxable Income', 'Withholding Tax', 'SSS EE', 'PhilHealth EE', 'Pag-IBIG EE'],
      ...result.recordset.map((r: any) => [
        r.TIN || '', r.LastName, r.FirstName, r.MiddleName || '',
        String(r.GrossPay), String(r.GrossPay - r.SssEmployeeShare - r.PhilHealthEmployeeShare - r.PagIbigEmployeeShare),
        String(r.WithholdingTax), String(r.SssEmployeeShare), String(r.PhilHealthEmployeeShare), String(r.PagIbigEmployeeShare),
      ]),
    ];
  } else if (reportType === 'SSS_R3') {
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
    reportData = [
      ['SSS No', 'Last Name', 'First Name', 'EE Share', 'ER Share'],
      ...result.recordset.map((r: any) => [
        r.SssNo || '', r.LastName, r.FirstName, String(r.SssEmployeeShare), String(r.SssEmployerShare),
      ]),
    ];
  } else if (reportType === 'SSS_R5') {
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
    reportData = [
      ['SSS No', 'Last Name', 'First Name', 'Monthly Salary Credit', 'EE Contribution', 'ER Contribution'],
      ...result.recordset.map((r: any) => [
        r.SssNo || '', r.LastName, r.FirstName, '', String(r.SssEmployeeShare), String(r.SssEmployerShare),
      ]),
    ];
  } else if (reportType === 'PagIbig_M1A' || reportType === 'PagIbig_M2') {
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
    reportData = [
      ['Pag-IBIG No', 'Last Name', 'First Name', 'EE Contribution', 'ER Contribution'],
      ...result.recordset.map((r: any) => [
        r.PagIbigNo || '', r.LastName, r.FirstName, String(r.PagIbigEmployeeShare), String(r.PagIbigEmployerShare),
      ]),
    ];
  } else if (reportType === 'PhilHealth_RF1') {
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
    reportData = [
      ['PhilHealth No', 'Last Name', 'First Name', 'EE Contribution', 'ER Contribution'],
      ...result.recordset.map((r: any) => [
        r.PhilHealthNo || '', r.LastName, r.FirstName, String(r.PhilHealthEmployeeShare), String(r.PhilHealthEmployerShare),
      ]),
    ];
  } else if (reportType === 'BIR_1601C') {
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
    const totalTax = result.recordset.reduce((sum: number, r: any) => sum + (r.WithholdingTax || 0), 0);
    reportData = [
      ['TIN', 'Last Name', 'First Name', 'Withholding Tax'],
      ...result.recordset.map((r: any) => [
        r.TIN || '', r.LastName, r.FirstName, String(r.WithholdingTax),
      ]),
      ['', '', 'TOTAL', String(totalTax)],
    ];
  } else if (reportType === 'GSIS_Premium') {
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT e.GsisNo, e.FirstName, e.LastName, p.GsisEmployeeShare, p.GsisEmployerShare, p.GsisECShare
        FROM dbo.Payslips p
        INNER JOIN dbo.Employees e ON p.EmployeeId = e.Id
        INNER JOIN dbo.PayrollRuns pr ON p.PayrollRunId = pr.Id
        INNER JOIN dbo.PayrollPeriods pp ON pr.PayrollPeriodId = pp.Id
        WHERE p.TenantId = @TenantId AND pp.Status = 'Closed' AND p.IsDeleted = 0
      `);
    reportData = [
      ['GSIS No', 'Last Name', 'First Name', 'EE Premium', 'ER Premium', 'EC Contribution'],
      ...result.recordset.map((r: any) => [
        r.GsisNo || '', r.LastName, r.FirstName, String(r.GsisEmployeeShare), String(r.GsisEmployerShare), String(r.GsisECShare),
      ]),
    ];
  } else if (reportType === 'GSIS_Loans') {
    // GSIS Loan Amortization Report — summarizes GSIS loan deductions per employee
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT e.EmployeeNo, e.FirstName, e.LastName, e.GsisNo,
               el.LoanType, el.PrincipalAmount, el.MonthlyAmortization,
               el.RemainingBalance, el.StartDate
        FROM dbo.EmployeeLoans el
        INNER JOIN dbo.Employees e ON el.EmployeeId = e.Id
        WHERE el.TenantId = @TenantId AND el.IsDeleted = 0 AND el.RemainingBalance > 0
          AND el.LoanType LIKE 'GSIS_%'
        ORDER BY e.LastName, e.FirstName, el.LoanType
      `);
    reportData = [
      ['Employee No', 'Last Name', 'First Name', 'GSIS No', 'Loan Type', 'Principal', 'Monthly Amortization', 'Remaining Balance', 'Start Date'],
      ...result.recordset.map((r: any) => [
        r.EmployeeNo, r.LastName, r.FirstName, r.GsisNo || '',
        r.LoanType, String(r.PrincipalAmount), String(r.MonthlyAmortization),
        String(r.RemainingBalance), r.StartDate ? new Date(r.StartDate).toISOString().split('T')[0] : '',
      ]),
    ];
  } else if (reportType === 'PERA_Summary') {
    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Year', sql.Int, new Date().getFullYear())
      .query(`
        SELECT e.EmployeeNo, e.FirstName, e.LastName,
               ISNULL(SUM(pc.EmployeeContribution), 0) AS YtdEmployeeShare,
               ISNULL(SUM(pc.EmployerContribution), 0) AS YtdEmployerShare,
               COUNT(*) AS ContributionCount
        FROM dbo.EmployeePeraContributions pc
        INNER JOIN dbo.Employees e ON pc.EmployeeId = e.Id
        WHERE pc.TenantId = @TenantId AND pc.ContributionYear = @Year AND pc.IsDeleted = 0
        GROUP BY e.EmployeeNo, e.FirstName, e.LastName
        ORDER BY e.LastName, e.FirstName
      `);
    reportData = [
      ['Employee No', 'Last Name', 'First Name', 'YTD Employee Share', 'YTD Employer Share', 'Contributions Count'],
      ...result.recordset.map((r: any) => [
        r.EmployeeNo, r.LastName, r.FirstName,
        String(r.YtdEmployeeShare), String(r.YtdEmployerShare), String(r.ContributionCount),
      ]),
    ];
  }

  await pool.request()
    .input('Id', sql.NVarChar, reportId)
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('ReportType', sql.NVarChar, reportType)
    .input('PeriodCovered', sql.NVarChar, periodCovered)
    .input('FileUrl', sql.NVarChar, fileUrl)
    .query(`
      INSERT INTO dbo.GovernmentReportExports (Id, TenantId, ReportType, PeriodCovered, FileUrl)
      VALUES (@Id, @TenantId, @ReportType, @PeriodCovered, @FileUrl)
    `);

  return { reportId, fileUrl };
}

export function computePayslip(
  input: EmployeePayInput,
  contributionBrackets: ContributionBracket[],
  loanDeductions = 0,
  workingDaysPerYear?: number,
  isGovernment = false,
  peraEmployeeShare = 0,
  peraEmployerShare = 0,
  loanBreakdown: LoanBreakdownItem[] = [],
): PayslipResult {
  const dailyRate = computeDailyRate(input.BasicSalary, workingDaysPerYear);
  const hourlyRate = computeHourlyRate(dailyRate);
  const workingDaysPerMonth = getWorkingDaysPerMonth(input.PayFrequency, workingDaysPerYear);

  const absentDays = Math.max(0, workingDaysPerMonth - input.DaysWorked);
  const basicPay = roundTo2(dailyRate * workingDaysPerMonth);
  const absentDeduction = computeAbsentDeduction(dailyRate, absentDays);
  const lateDeduction = computeLateDeduction(hourlyRate, input.LateMinutes);
  const undertimeDeduction = computeUndertimeDeduction(hourlyRate, input.UndertimeMinutes);
  const overtimePay = computeOvertimePay(hourlyRate, input.OvertimeMinutes);
  const nightDiffPay = computeNightDiffPay(hourlyRate, input.NightDiffMinutes);

  let holidayPay = 0;
  if (input.HolidayPayDays > 0) {
    const holidayMultiplier = input.IsRegularHoliday ? 2.00 : 1.30;
    holidayPay = computeHolidayPay(dailyRate, input.HolidayPayDays, holidayMultiplier);
  }

  let restDayPremium = 0;
  if (input.RestDayPayDays > 0) {
    const restDayMultiplier = input.IsRegularHoliday ? 2.60 : input.IsSpecialNonWorkingDay ? 1.50 : 1.30;
    restDayPremium = computeRestDayPremium(dailyRate, input.RestDayPayDays, restDayMultiplier);
  }

  const allowances = roundTo2(input.Allowances || 0);
  const deMinimisBrackets = contributionBrackets.filter(b => b.TableType === 'DeMinimis');
  const deMinimisBenefits = computeDeMinimisBenefits(input.DeMinimisBenefits || 0, deMinimisBrackets);

  const grossPay = roundTo2(basicPay + overtimePay + nightDiffPay + holidayPay + restDayPremium + allowances);

  let sssEmployeeShare = 0;
  let sssEmployerShare = 0;
  let sssMPFEmployee = 0;
  let sssMPFEmployer = 0;
  let gsisEmployeeShare = 0;
  let gsisEmployerShare = 0;
  let gsisECShare = 0;

  if (isGovernment) {
    const gsisBrackets = contributionBrackets.filter(b => b.TableType === 'GSIS' || b.TableType === 'GSIS_EC');
    const gsis = lookupGSIS(gsisBrackets, input.BasicSalary);
    gsisEmployeeShare = gsis.employeeShare;
    gsisEmployerShare = gsis.employerShare;
    gsisECShare = gsis.ecShare;
  } else {
    const sssBrackets = contributionBrackets.filter(b => b.TableType === 'SSS' && b.EmployeeShare !== null);
    const sss = lookupSSS(sssBrackets, input.BasicSalary);
    sssEmployeeShare = sss.employeeShare;
    sssEmployerShare = sss.employerShare;
    sssMPFEmployee = computeSSSMPF(contributionBrackets, input.BasicSalary).employeeShare;
    sssMPFEmployer = computeSSSMPF(contributionBrackets, input.BasicSalary).employerShare;
  }

  const philHealthBrackets = contributionBrackets.filter(b => b.TableType === 'PhilHealth');
  const philHealth = lookupPhilHealth(philHealthBrackets, input.BasicSalary);

  const pagIbigBrackets = contributionBrackets.filter(b => b.TableType === 'PagIbig');
  const pagIbig = lookupPagIbig(pagIbigBrackets, input.BasicSalary);

  const taxableIncome = grossPay - deMinimisBenefits - sssEmployeeShare - sssMPFEmployee - gsisEmployeeShare - philHealth.employeeShare - pagIbig.employeeShare;
  const taxBrackets = contributionBrackets.filter(b => b.TableType === 'WithholdingTax');
  const withholdingTax = lookupWithholdingTax(taxBrackets, Math.max(0, taxableIncome));

  const thirteenthMonthAccrual = roundTo2(basicPay / 12);

  const totalDeductions = roundTo2(absentDeduction + lateDeduction + undertimeDeduction + sssEmployeeShare + sssMPFEmployee + gsisEmployeeShare + philHealth.employeeShare + pagIbig.employeeShare + withholdingTax + loanDeductions + peraEmployeeShare);
  const netPay = roundTo2(grossPay - totalDeductions);

  return {
    EmployeeId: input.EmployeeId,
    BasicPay: basicPay,
    TotalWorkedDays: input.DaysWorked,
    AbsentDeduction: absentDeduction,
    LateDeduction: lateDeduction,
    UndertimeDeduction: undertimeDeduction,
    OvertimePay: overtimePay,
    NightDiffPay: nightDiffPay,
    HolidayPay: holidayPay,
    RestDayPremium: restDayPremium,
    Allowances: allowances,
    DeMinimisBenefits: deMinimisBenefits,
    GrossPay: grossPay,
    SssEmployeeShare: sssEmployeeShare,
    SssEmployerShare: sssEmployerShare,
    SssMPFEmployee: sssMPFEmployee,
    SssMPFEmployer: sssMPFEmployer,
    PhilHealthEmployeeShare: philHealth.employeeShare,
    PhilHealthEmployerShare: philHealth.employerShare,
    PagIbigEmployeeShare: pagIbig.employeeShare,
    PagIbigEmployerShare: pagIbig.employerShare,
    GsisEmployeeShare: gsisEmployeeShare,
    GsisEmployerShare: gsisEmployerShare,
    GsisECShare: gsisECShare,
    PeraEmployeeShare: peraEmployeeShare,
    PeraEmployerShare: peraEmployerShare,
    WithholdingTax: withholdingTax,
    ThirteenthMonthPayAccrual: thirteenthMonthAccrual,
    LoanDeductions: roundTo2(loanDeductions),
    LoanBreakdown: loanBreakdown,
    OtherDeductions: 0,
    TotalDeductions: totalDeductions,
    NetPay: netPay,
  };
}

export async function fetchContributionBrackets(pool: sql.ConnectionPool, effectiveYear: number): Promise<ContributionBracket[]> {
  const result = await pool.request()
    .input('EffectiveYear', sql.Int, effectiveYear)
    .query(`
      SELECT Id, EffectiveYear, TableType, BracketMin, BracketMax,
             EmployeeShare, EmployerShare, FixedAmount, RatePercent, Description
      FROM dbo.GovContributionTables
      WHERE EffectiveYear = @EffectiveYear
      ORDER BY TableType, BracketMin
    `);
  return result.recordset;
}

export async function fetchPeraEnrollment(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeId: string,
  peraLimits: ContributionBracket[]
): Promise<{ employeeContribution: number; employerContribution: number }> {
  const result = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('EmployeeId', sql.UniqueIdentifier, employeeId)
    .query(`
      SELECT IsEnrolled, ContributionType, EmployeeContributionAmount,
             EmployerMatchType, EmployerMatchValue, EmployerMatchMaxCap
      FROM dbo.EmployeePeraEnrollment
      WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId AND IsEnrolled = 1 AND IsDeleted = 0
    `);

  if (result.recordset.length === 0) {
    return { employeeContribution: 0, employerContribution: 0 };
  }

  const enrollment = result.recordset[0];

  const localCap = peraLimits.find(l => l.Description?.includes('Local') && l.FixedAmount !== null);
  const ofwCap = peraLimits.find(l => l.Description?.includes('OFW') && l.FixedAmount !== null);
  const annualLimit = localCap?.FixedAmount || 200000;

  const ytdResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('EmployeeId', sql.UniqueIdentifier, employeeId)
    .input('Year', sql.Int, new Date().getFullYear())
    .query(`
      SELECT ISNULL(SUM(EmployeeContribution), 0) AS YtdEmployee
      FROM dbo.EmployeePeraContributions
      WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId
        AND ContributionYear = @Year AND IsDeleted = 0
    `);

  const ytdEmployee = ytdResult.recordset[0]?.YtdEmployee || 0;
  const remainingLimit = Math.max(0, annualLimit - ytdEmployee);

  let employeeContribution = 0;
  if (enrollment.ContributionType === 'Fixed') {
    employeeContribution = enrollment.EmployeeContributionAmount || 0;
  }

  employeeContribution = Math.min(employeeContribution, remainingLimit);
  employeeContribution = roundTo2(employeeContribution);

  let employerContribution = 0;
  if (enrollment.EmployerMatchType === 'Fixed' && enrollment.EmployerMatchValue) {
    employerContribution = enrollment.EmployerMatchValue;
  } else if (enrollment.EmployerMatchType === 'Percentage' && enrollment.EmployerMatchValue) {
    employerContribution = roundTo2(employeeContribution * (enrollment.EmployerMatchValue / 100));
  }
  if (enrollment.EmployerMatchMaxCap) {
    employerContribution = Math.min(employerContribution, enrollment.EmployerMatchMaxCap);
  }
  employerContribution = roundTo2(employerContribution);

  return { employeeContribution, employerContribution };
}

export async function fetchEmployeeLoans(
  pool: sql.ConnectionPool,
  tenantId: string,
  employeeId: string
): Promise<{ MonthlyAmortization: number; RemainingBalance: number; LoanType: string }[]> {
  const result = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('EmployeeId', sql.UniqueIdentifier, employeeId)
    .query(`
      SELECT MonthlyAmortization, RemainingBalance, LoanType
      FROM dbo.EmployeeLoans
      WHERE TenantId = @TenantId AND EmployeeId = @EmployeeId AND IsDeleted = 0 AND RemainingBalance > 0
    `);
  return result.recordset;
}

export async function computePayrollForAllEmployees(
  pool: sql.ConnectionPool,
  tenantId: string,
  payrollPeriodId: string
): Promise<{ payslips: PayslipResult[]; totalGrossPay: number; totalNetPay: number; totalEmployerCost: number }> {
  const currentYear = new Date().getFullYear();
  const brackets = await fetchContributionBrackets(pool, currentYear);

  const tenantResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query('SELECT IsGovernment FROM dbo.Tenants WHERE Id = @TenantId');
  const isGovernment = tenantResult.recordset[0]?.IsGovernment === true;

  const periodResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('PayrollPeriodId', sql.UniqueIdentifier, payrollPeriodId)
    .query(`
      SELECT Id, PeriodStart, PeriodEnd, PayDate, PayFrequency
      FROM dbo.PayrollPeriods
      WHERE Id = @PayrollPeriodId AND TenantId = @TenantId AND IsDeleted = 0
    `);

  if (periodResult.recordset.length === 0) {
    throw new Error('Payroll period not found');
  }

  const period = periodResult.recordset[0];
  const employeesResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .query(`
      SELECT e.Id, e.BasicSalary, e.PayFrequency, e.DepartmentId
      FROM dbo.Employees e
      WHERE e.TenantId = @TenantId AND e.IsActive = 1 AND e.IsDeleted = 0
    `);

  const holidaysResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('PeriodStart', sql.Date, new Date(period.PeriodStart))
    .input('PeriodEnd', sql.Date, new Date(period.PeriodEnd))
    .query(`
      SELECT HolidayDate, Type
      FROM dbo.Holidays
      WHERE TenantId = @TenantId AND HolidayDate >= @PeriodStart AND HolidayDate <= @PeriodEnd AND IsDeleted = 0
    `);

  const holidays = holidaysResult.recordset;
  const regularHolidays = new Set(holidays.filter(h => h.Type === 'Regular').map(h => new Date(h.HolidayDate).toISOString().split('T')[0]));
  const specialHolidays = new Set(holidays.filter(h => h.Type === 'SpecialNonWorking').map(h => new Date(h.HolidayDate).toISOString().split('T')[0]));

  const dtrResult = await pool.request()
    .input('TenantId', sql.UniqueIdentifier, tenantId)
    .input('PeriodStart', sql.Date, new Date(period.PeriodStart))
    .input('PeriodEnd', sql.Date, new Date(period.PeriodEnd))
    .query(`
      SELECT EmployeeId, WorkDate, LateMinutes, UndertimeMinutes, OvertimeMinutes, NightDiffMinutes, Status
      FROM dbo.DailyTimeRecords
      WHERE TenantId = @TenantId AND WorkDate >= @PeriodStart AND WorkDate <= @PeriodEnd AND IsDeleted = 0
    `);

  const payslips: PayslipResult[] = [];
  let totalGrossPay = 0;
  let totalNetPay = 0;
  let totalEmployerCost = 0;

  for (const employee of employeesResult.recordset) {
    const employeeDtr = dtrResult.recordset.filter(d => d.EmployeeId === employee.Id);

    let totalLateMinutes = 0;
    let totalUndertimeMinutes = 0;
    let totalOvertimeMinutes = 0;
    let totalNightDiffMinutes = 0;
    let daysWorked = 0;
    let holidayPayDays = 0;
    let restDayPayDays = 0;
    let hasRegularHoliday = false;
    let hasSpecialNonWorkingDay = false;

    for (const dtr of employeeDtr) {
      totalLateMinutes += dtr.LateMinutes || 0;
      totalUndertimeMinutes += dtr.UndertimeMinutes || 0;
      totalOvertimeMinutes += dtr.OvertimeMinutes || 0;
      totalNightDiffMinutes += dtr.NightDiffMinutes || 0;

      const workDateStr = new Date(dtr.WorkDate).toISOString().split('T')[0];

      if (dtr.Status === 'Present' || dtr.Status === 'Late') {
        daysWorked++;
        if (regularHolidays.has(workDateStr)) {
          holidayPayDays++;
          hasRegularHoliday = true;
        } else if (specialHolidays.has(workDateStr)) {
          holidayPayDays++;
          hasSpecialNonWorkingDay = true;
        }
      } else if (dtr.Status === 'RestDay') {
        restDayPayDays++;
      }
    }

    const loans = await fetchEmployeeLoans(pool, tenantId!, employee.Id);
    const { totalDeduction: loanDeductions, breakdown: loanBreakdown } = computeLoanDeductions(loans);

    const peraLimits = brackets.filter(b => b.TableType === 'PERA');
    const pera = await fetchPeraEnrollment(pool, tenantId!, employee.Id, peraLimits);

    const input: EmployeePayInput = {
      EmployeeId: employee.Id,
      BasicSalary: employee.BasicSalary,
      PayFrequency: period.PayFrequency,
      DaysWorked: daysWorked,
      LateMinutes: totalLateMinutes,
      UndertimeMinutes: totalUndertimeMinutes,
      OvertimeMinutes: totalOvertimeMinutes,
      NightDiffMinutes: totalNightDiffMinutes,
      HolidayPayDays: holidayPayDays,
      RestDayPayDays: restDayPayDays,
      IsRegularHoliday: hasRegularHoliday,
      IsSpecialNonWorkingDay: hasSpecialNonWorkingDay,
    };

    const payslip = computePayslip(input, brackets, loanDeductions, undefined, isGovernment, pera.employeeContribution, pera.employerContribution, loanBreakdown);
    payslips.push(payslip);

    totalGrossPay += payslip.GrossPay;
    totalNetPay += payslip.NetPay;
    totalEmployerCost += payslip.GrossPay + payslip.SssEmployerShare + payslip.SssMPFEmployer + payslip.GsisEmployerShare + payslip.GsisECShare + payslip.PhilHealthEmployerShare + payslip.PagIbigEmployerShare + payslip.PeraEmployerShare;
  }

  return {
    payslips,
    totalGrossPay: roundTo2(totalGrossPay),
    totalNetPay: roundTo2(totalNetPay),
    totalEmployerCost: roundTo2(totalEmployerCost),
  };
}
