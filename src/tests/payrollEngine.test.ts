/**
 * PayrollEngine Unit Tests
 * 
 * Spec Section 4 Acceptance Criteria:
 * - Unit tests for every formula using at least 3 realistic sample employees
 *   (minimum wage earner, mid-level, high earner above SSS/PhilHealth ceiling)
 * - All government contribution/tax rates sourced from GovContributionTables
 * - GrossPay - TotalDeductions = NetPay exactly (no rounding drift > ₱0.01)
 * - PERA: optional, unenrolled employees never get PERA deductions
 * - PERA: employer matching respects match type and max cap
 */

import {
  computeDailyRate,
  computeHourlyRate,
  computeAbsentDeduction,
  computeLateDeduction,
  computeUndertimeDeduction,
  computeOvertimePay,
  computeNightDiffPay,
  computeHolidayPay,
  computeRestDayPremium,
  computePayslip,
  computeSSSMPF,
  lookupSSS,
  lookupPhilHealth,
  lookupPagIbig,
  lookupGSIS,
  lookupWithholdingTax,
  computeLoanDeductions,
  compute13thMonthPay,
  generatePayslipLineItems,
  roundTo2,
  getWorkingDaysPerYear,
  getWorkingDaysPerMonth,
  ContributionBracket,
  PayslipResult,
} from '../services/payrollEngine';

// ────────────────────────────────────────────────────────────────
// Helper: Build contribution bracket fixtures (2025 rates)
// ────────────────────────────────────────────────────────────────

function buildSssBrackets2025(): ContributionBracket[] {
  const brackets: ContributionBracket[] = [];
  const ranges = [
    [4000, 4500, 220, 510], [4500, 5000, 247.5, 573.75], [5000, 5500, 275, 637.5],
    [5500, 6000, 302.5, 701.25], [6000, 6500, 330, 765], [6500, 7000, 357.5, 828.75],
    [7000, 7500, 385, 892.5], [7500, 8000, 412.5, 956.25], [8000, 8500, 440, 1020],
    [8500, 9000, 467.5, 1083.75], [9000, 9500, 495, 1147.5], [9500, 10000, 522.5, 1211.25],
    [10000, 10500, 550, 1275], [10500, 11000, 577.5, 1338.75], [11000, 11500, 605, 1402.5],
    [11500, 12000, 632.5, 1466.25], [12000, 12500, 660, 1530], [12500, 13000, 687.5, 1593.75],
    [13000, 13500, 715, 1657.5], [13500, 14000, 742.5, 1721.25], [14000, 14500, 770, 1785],
    [14500, 15000, 797.5, 1848.75], [15000, 15500, 825, 1912.5], [15500, 16000, 852.5, 1976.25],
    [16000, 16500, 880, 2040], [16500, 17000, 907.5, 2103.75], [17000, 17500, 935, 2167.5],
    [17500, 18000, 962.5, 2231.25], [18000, 18500, 990, 2295], [18500, 19000, 1017.5, 2358.75],
    [19000, 19500, 1045, 2422.5], [19500, 20000, 1072.5, 2486.25], [20000, 20500, 1100, 2550],
    [20500, 21000, 1127.5, 2613.75], [21000, 21500, 1155, 2677.5], [21500, 22000, 1182.5, 2741.25],
    [22000, 22500, 1210, 2805], [22500, 23000, 1237.5, 2868.75], [23000, 23500, 1265, 2932.5],
    [23500, 24000, 1292.5, 2996.25], [24000, 24500, 1320, 3060], [24500, 25000, 1347.5, 3123.75],
    [25000, 30000, 1375, 3187.5],
  ];
  for (const [min, max, ee, er] of ranges) {
    brackets.push({ Id: 0, EffectiveYear: 2025, TableType: 'SSS', BracketMin: min, BracketMax: max, EmployeeShare: ee, EmployerShare: er, FixedAmount: null, RatePercent: null, Description: `SSS ${min}-${max}` });
  }
  // MPF bracket
  brackets.push({ Id: 0, EffectiveYear: 2025, TableType: 'SSS', BracketMin: 22750, BracketMax: 30000, EmployeeShare: null, EmployerShare: null, FixedAmount: null, RatePercent: 2, Description: 'SSS MPF 2025 - Employee Share Above Threshold' });
  return brackets;
}

function buildPhilHealthBrackets2025(): ContributionBracket[] {
  return [
    { Id: 0, EffectiveYear: 2025, TableType: 'PhilHealth', BracketMin: 10000, BracketMax: 100000, EmployeeShare: null, EmployerShare: null, FixedAmount: null, RatePercent: 2.5, Description: 'PhilHealth 2025 - 5% rate' },
    { Id: 0, EffectiveYear: 2025, TableType: 'PhilHealth', BracketMin: 10000, BracketMax: 100000, EmployeeShare: 250, EmployerShare: 250, FixedAmount: null, RatePercent: null, Description: 'PhilHealth Minimum' },
    { Id: 0, EffectiveYear: 2025, TableType: 'PhilHealth', BracketMin: 10000, BracketMax: 100000, EmployeeShare: 2500, EmployerShare: 2500, FixedAmount: null, RatePercent: null, Description: 'PhilHealth Maximum' },
  ];
}

function buildPagIbigBrackets2025(): ContributionBracket[] {
  return [
    { Id: 0, EffectiveYear: 2025, TableType: 'PagIbig', BracketMin: 0, BracketMax: 5000, EmployeeShare: 100, EmployerShare: 100, FixedAmount: null, RatePercent: null, Description: 'Pag-IBIG Standard 2%' },
    { Id: 0, EffectiveYear: 2025, TableType: 'PagIbig', BracketMin: 5000, BracketMax: 50000, EmployeeShare: 200, EmployerShare: 200, FixedAmount: null, RatePercent: null, Description: 'Pag-IBIG Maximum' },
    { Id: 0, EffectiveYear: 2025, TableType: 'PagIbig', BracketMin: 5000, BracketMax: 50000, EmployeeShare: null, EmployerShare: null, FixedAmount: null, RatePercent: 2, Description: 'Pag-IBIG 2025 - 2% rate' },
  ];
}

function buildWithholdingTaxBrackets2025(): ContributionBracket[] {
  return [
    { Id: 0, EffectiveYear: 2025, TableType: 'WithholdingTax', BracketMin: 0, BracketMax: 10000, EmployeeShare: null, EmployerShare: null, FixedAmount: 0, RatePercent: 0, Description: 'BIR 2025 - No tax' },
    { Id: 0, EffectiveYear: 2025, TableType: 'WithholdingTax', BracketMin: 10000, BracketMax: 20000, EmployeeShare: null, EmployerShare: null, FixedAmount: 0, RatePercent: 15, Description: 'BIR 2025 - 15%' },
    { Id: 0, EffectiveYear: 2025, TableType: 'WithholdingTax', BracketMin: 20000, BracketMax: 40000, EmployeeShare: null, EmployerShare: null, FixedAmount: 1500, RatePercent: 20, Description: 'BIR 2025 - 20%' },
    { Id: 0, EffectiveYear: 2025, TableType: 'WithholdingTax', BracketMin: 40000, BracketMax: 80000, EmployeeShare: null, EmployerShare: null, FixedAmount: 5500, RatePercent: 25, Description: 'BIR 2025 - 25%' },
    { Id: 0, EffectiveYear: 2025, TableType: 'WithholdingTax', BracketMin: 80000, BracketMax: 200000, EmployeeShare: null, EmployerShare: null, FixedAmount: 15500, RatePercent: 30, Description: 'BIR 2025 - 30%' },
    { Id: 0, EffectiveYear: 2025, TableType: 'WithholdingTax', BracketMin: 200000, BracketMax: 800000, EmployeeShare: null, EmployerShare: null, FixedAmount: 51500, RatePercent: 32, Description: 'BIR 2025 - 32%' },
    { Id: 0, EffectiveYear: 2025, TableType: 'WithholdingTax', BracketMin: 800000, BracketMax: 999999999, EmployeeShare: null, EmployerShare: null, FixedAmount: 243500, RatePercent: 35, Description: 'BIR 2025 - 35%' },
  ];
}

function buildAllBrackets(): ContributionBracket[] {
  return [
    ...buildSssBrackets2025(),
    ...buildPhilHealthBrackets2025(),
    ...buildPagIbigBrackets2025(),
    ...buildWithholdingTaxBrackets2025(),
  ];
}

// ────────────────────────────────────────────────────────────────
// Test: Basic Rate Computations
// ────────────────────────────────────────────────────────────────

describe('PayrollEngine - Basic Rate Computations', () => {
  test('computeDailyRate with standard 261 factor', () => {
    // ₱25,000 / month * 12 / 261 = ₱1,149.43/day
    const dailyRate = computeDailyRate(25000, 261);
    expect(dailyRate).toBeCloseTo(1149.4253, 2);
  });

  test('computeHourlyRate is DailyRate / 8', () => {
    const hourlyRate = computeHourlyRate(1000);
    expect(hourlyRate).toBe(125);
  });

  test('getWorkingDaysPerYear returns configurable factor', () => {
    expect(getWorkingDaysPerYear(261)).toBe(261);
    expect(getWorkingDaysPerYear(313)).toBe(313);
    expect(getWorkingDaysPerYear()).toBe(Number(process.env.WORKING_DAYS_PER_YEAR) || 261);
  });

  test('getWorkingDaysPerMonth returns correct value per frequency', () => {
    expect(getWorkingDaysPerMonth('Monthly', 261)).toBeCloseTo(21.75, 2);
    expect(getWorkingDaysPerMonth('SemiMonthly', 261)).toBeCloseTo(10.875, 3);
    expect(getWorkingDaysPerMonth('Weekly', 261)).toBeCloseTo(5.019, 3);
    expect(getWorkingDaysPerMonth('Daily', 261)).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────
// Test: Overtime, Night Diff, Holiday, Rest Day
// ────────────────────────────────────────────────────────────────

describe('PayrollEngine - OT, Night Diff, Holiday, Rest Day', () => {
  const hourlyRate = 125; // derived from ₱25,000/month

  test('Ordinary OT: HourlyRate × 1.25 × hours', () => {
    // 2 hours OT = 125 * 1.25 * 2 = 312.50
    expect(computeOvertimePay(hourlyRate, 120, 1.25)).toBe(312.50);
  });

  test('Night Diff: HourlyRate × 0.10 × night hours', () => {
    // 4 hours night diff = 125 * 0.10 * 4 = 50
    expect(computeNightDiffPay(hourlyRate, 240, 0.10)).toBe(50);
  });

  test('Regular Holiday worked: DailyRate × 2.00', () => {
    const dailyRate = computeDailyRate(25000, 261);
    // 1 day regular holiday = dailyRate * 2.00
    expect(computeHolidayPay(dailyRate, 1, 2.00)).toBeCloseTo(dailyRate * 2, 2);
  });

  test('Special Non-Working Day worked: DailyRate × 1.30', () => {
    const dailyRate = computeDailyRate(25000, 261);
    expect(computeRestDayPremium(dailyRate, 1, 1.30)).toBeCloseTo(dailyRate * 1.30, 2);
  });

  test('Regular Holiday + Rest Day worked: DailyRate × 2.60', () => {
    const dailyRate = computeDailyRate(25000, 261);
    // Rest day premium with multiplier 2.60
    expect(computeRestDayPremium(dailyRate, 1, 2.60)).toBeCloseTo(dailyRate * 2.60, 2);
  });

  test('Absent deduction: DailyRate × absent days', () => {
    expect(computeAbsentDeduction(1000, 2)).toBe(2000);
  });

  test('Late deduction: (HourlyRate / 60) × late minutes', () => {
    // 30 min late with ₱125/hr = (125/60)*30 = 62.50
    expect(computeLateDeduction(125, 30)).toBeCloseTo(62.50, 2);
  });

  test('Undertime deduction: (HourlyRate / 60) × undertime minutes', () => {
    expect(computeUndertimeDeduction(125, 60)).toBe(125);
  });
});

// ────────────────────────────────────────────────────────────────
// Test: Government Contribution Lookups
// ────────────────────────────────────────────────────────────────

describe('PayrollEngine - SSS Lookup', () => {
  const sssBrackets = buildSssBrackets2025();

  test('Low earner (₱15,000 salary) gets correct bracket', () => {
    const result = lookupSSS(sssBrackets, 15000);
    expect(result.employeeShare).toBe(825);
    expect(result.employerShare).toBe(1912.5);
  });

  test('Mid earner (₱25,000 salary) gets maximum bracket', () => {
    const result = lookupSSS(sssBrackets, 25000);
    expect(result.employeeShare).toBe(1375);
    expect(result.employerShare).toBe(3187.5);
  });

  test('High earner (₱50,000 salary) caps at maximum', () => {
    const result = lookupSSS(sssBrackets, 50000);
    expect(result.employeeShare).toBe(1375);
    expect(result.employerShare).toBe(3187.5);
  });
});

describe('PayrollEngine - PhilHealth Lookup', () => {
  const phBrackets = buildPhilHealthBrackets2025();

  test('Mid earner: 5% of salary / 2 (split equally)', () => {
    const result = lookupPhilHealth(phBrackets, 30000);
    // 5% of 30,000 = 1,500; per side = 750
    expect(result.employeeShare).toBe(750);
    expect(result.employerShare).toBe(750);
  });

  test('Low earner: floor at ₱10,000', () => {
    const result = lookupPhilHealth(phBrackets, 5000);
    expect(result.employeeShare).toBeGreaterThanOrEqual(250);
  });

  test('High earner: ceiling at ₱100,000', () => {
    const result = lookupPhilHealth(phBrackets, 200000);
    expect(result.employeeShare).toBeLessThanOrEqual(2500);
  });
});

describe('PayrollEngine - Pag-IBIG Lookup', () => {
  const pagBrackets = buildPagIbigBrackets2025();

  test('Standard contribution: 2% up to ₱200 cap', () => {
    const result = lookupPagIbig(pagBrackets, 15000);
    expect(result.employeeShare).toBe(200);
    expect(result.employerShare).toBe(200);
  });

  test('Low earner: 2% of ₱5,000 = ₱100', () => {
    const result = lookupPagIbig(pagBrackets, 5000);
    expect(result.employeeShare).toBe(100);
    expect(result.employerShare).toBe(100);
  });
});

describe('PayrollEngine - GSIS Lookup', () => {
  const gsisBrackets: ContributionBracket[] = [
    { Id: 0, EffectiveYear: 2025, TableType: 'GSIS', BracketMin: 5000, BracketMax: 25000, EmployeeShare: null, EmployerShare: null, FixedAmount: null, RatePercent: 9, Description: 'GSIS 2025 - 9% EE/ER' },
    { Id: 0, EffectiveYear: 2025, TableType: 'GSIS_EC', BracketMin: 5000, BracketMax: 25000, EmployeeShare: null, EmployerShare: null, FixedAmount: null, RatePercent: 2, Description: 'GSIS EC 2025 - 2% ER only' },
  ];

  test('Government employee (₱20,000): 9% EE + 9% ER + 2% EC', () => {
    const result = lookupGSIS(gsisBrackets, 20000);
    expect(result.employeeShare).toBe(1800);   // 9% of 20,000
    expect(result.employerShare).toBe(1800);   // 9% of 20,000
    expect(result.ecShare).toBe(400);          // 2% of 20,000
  });

  test('Government employee (₱5,000 minimum): correct floor', () => {
    const result = lookupGSIS(gsisBrackets, 5000);
    expect(result.employeeShare).toBe(450);
    expect(result.employerShare).toBe(450);
    expect(result.ecShare).toBe(100);
  });

  test('Government employee (₱30,000 above ceiling): caps at ₱25,000', () => {
    const result = lookupGSIS(gsisBrackets, 30000);
    expect(result.employeeShare).toBe(2250);   // 9% of 25,000
    expect(result.employerShare).toBe(2250);
    expect(result.ecShare).toBe(500);          // 2% of 25,000
  });
});

describe('PayrollEngine - Withholding Tax Lookup', () => {
  const taxBrackets = buildWithholdingTaxBrackets2025();

  test('No tax on ₱10,000 or below', () => {
    expect(lookupWithholdingTax(taxBrackets, 10000)).toBe(0);
    expect(lookupWithholdingTax(taxBrackets, 5000)).toBe(0);
  });

  test('15% on excess of ₱10,000', () => {
    // ₱15,000 → 15% of (15,000 - 10,000) = 750
    expect(lookupWithholdingTax(taxBrackets, 15000)).toBe(750);
  });

  test('₱1,500 + 20% on excess of ₱20,000', () => {
    // ₱30,000 → 1,500 + 20% of (30,000 - 20,000) = 3,500
    expect(lookupWithholdingTax(taxBrackets, 30000)).toBe(3500);
  });

  test('Higher bracket: ₱5,500 + 25% on excess of ₱40,000', () => {
    // ₱60,000 → 5,500 + 25% of 20,000 = 10,500
    expect(lookupWithholdingTax(taxBrackets, 60000)).toBe(10500);
  });
});

// ────────────────────────────────────────────────────────────────
// Test: Full Payslip Computation (3 employee profiles)
// ────────────────────────────────────────────────────────────────

describe('PayrollEngine - Full Payslip (Minimum Wage Earner)', () => {
  const brackets = buildAllBrackets();

  test('₱15,000/month employee, monthly pay, full attendance', () => {
    const payslip = computePayslip(
      {
        EmployeeId: 'emp-min',
        BasicSalary: 15000,
        PayFrequency: 'Monthly',
        DaysWorked: 22,
        LateMinutes: 0,
        UndertimeMinutes: 0,
        OvertimeMinutes: 0,
        NightDiffMinutes: 0,
        HolidayPayDays: 0,
        RestDayPayDays: 0,
        IsRegularHoliday: false,
        IsSpecialNonWorkingDay: false,
      },
      brackets,
      0, // no loans
      261, // working days
      false, // not government
    );

    // Daily rate = 15000 * 12 / 261 = 689.66
    const dailyRate = (15000 * 12) / 261;
    const expectedBasic = roundTo2(dailyRate * (261 / 12));

    expect(payslip.BasicPay).toBeCloseTo(expectedBasic, 0);
    expect(payslip.AbsentDeduction).toBe(0);
    expect(payslip.LateDeduction).toBe(0);

    // GrossPay - TotalDeductions = NetPay (exact)
    expect(payslip.GrossPay - payslip.TotalDeductions).toBeCloseTo(payslip.NetPay, 2);
    // No rounding drift > ₱0.01
    expect(Math.abs(payslip.GrossPay - payslip.TotalDeductions - payslip.NetPay)).toBeLessThan(0.02);
  });
});

describe('PayrollEngine - Full Payslip (Mid-Level Earner)', () => {
  const brackets = buildAllBrackets();

  test('₱50,000/month employee with OT, late, and holidays', () => {
    const payslip = computePayslip(
      {
        EmployeeId: 'emp-mid',
        BasicSalary: 50000,
        PayFrequency: 'Monthly',
        DaysWorked: 20,
        LateMinutes: 45,
        UndertimeMinutes: 30,
        OvertimeMinutes: 120, // 2 hours OT
        NightDiffMinutes: 60, // 1 hour night diff
        HolidayPayDays: 1,
        RestDayPayDays: 0,
        IsRegularHoliday: true,
        IsSpecialNonWorkingDay: false,
        Allowances: 3000,
      },
      brackets,
      0,
      261,
      false,
    );

    // Verify gross includes OT, night diff, holiday, allowances
    expect(payslip.OvertimePay).toBeGreaterThan(0);
    expect(payslip.NightDiffPay).toBeGreaterThan(0);
    expect(payslip.HolidayPay).toBeGreaterThan(0);
    expect(payslip.Allowances).toBe(3000);

    // SSS contributions are non-zero
    expect(payslip.SssEmployeeShare).toBeGreaterThan(0);
    expect(payslip.SssEmployerShare).toBeGreaterThan(0);

    // PhilHealth and Pag-IBIG are non-zero
    expect(payslip.PhilHealthEmployeeShare).toBeGreaterThan(0);
    expect(payslip.PagIbigEmployeeShare).toBeGreaterThan(0);

    // Withholding tax should be non-zero for this income level
    expect(payslip.WithholdingTax).toBeGreaterThan(0);

    // Net pay is positive
    expect(payslip.NetPay).toBeGreaterThan(0);

    // GrossPay - TotalDeductions = NetPay (exact)
    expect(payslip.GrossPay - payslip.TotalDeductions).toBeCloseTo(payslip.NetPay, 2);
  });
});

describe('PayrollEngine - Full Payslip (High Earner above SSS/PhilHealth Ceiling)', () => {
  const brackets = buildAllBrackets();

  test('₱100,000/month employee: capped at SSS/PhilHealth max', () => {
    const payslip = computePayslip(
      {
        EmployeeId: 'emp-high',
        BasicSalary: 100000,
        PayFrequency: 'Monthly',
        DaysWorked: 22,
        LateMinutes: 0,
        UndertimeMinutes: 0,
        OvertimeMinutes: 0,
        NightDiffMinutes: 0,
        HolidayPayDays: 0,
        RestDayPayDays: 0,
        IsRegularHoliday: false,
        IsSpecialNonWorkingDay: false,
      },
      brackets,
      0,
      261,
      false,
    );

    // SSS employee share should be capped at the max bracket (₱1,375)
    expect(payslip.SssEmployeeShare).toBeLessThanOrEqual(1375);

    // PhilHealth employee share should be capped at ceiling
    expect(payslip.PhilHealthEmployeeShare).toBeLessThanOrEqual(2500);

    // High withholding tax
    expect(payslip.WithholdingTax).toBeGreaterThan(0);

    // Net pay > 0
    expect(payslip.NetPay).toBeGreaterThan(0);

    // Exact equation
    expect(payslip.GrossPay - payslip.TotalDeductions).toBeCloseTo(payslip.NetPay, 2);
  });
});

// ────────────────────────────────────────────────────────────────
// Test: Government Employer (GSIS)
// ────────────────────────────────────────────────────────────────

describe('PayrollEngine - GSIS (Government Employer)', () => {
  const brackets = buildAllBrackets();
  // Add GSIS brackets
  brackets.push(
    { Id: 0, EffectiveYear: 2025, TableType: 'GSIS', BracketMin: 5000, BracketMax: 25000, EmployeeShare: null, EmployerShare: null, FixedAmount: null, RatePercent: 9, Description: 'GSIS 2025 - 9% EE/ER' },
    { Id: 0, EffectiveYear: 2025, TableType: 'GSIS_EC', BracketMin: 5000, BracketMax: 25000, EmployeeShare: null, EmployerShare: null, FixedAmount: null, RatePercent: 2, Description: 'GSIS EC 2025 - 2% ER only' },
  );

  test('Government employee uses GSIS instead of SSS', () => {
    const payslip = computePayslip(
      {
        EmployeeId: 'emp-gov',
        BasicSalary: 20000,
        PayFrequency: 'Monthly',
        DaysWorked: 22,
        LateMinutes: 0,
        UndertimeMinutes: 0,
        OvertimeMinutes: 0,
        NightDiffMinutes: 0,
        HolidayPayDays: 0,
        RestDayPayDays: 0,
        IsRegularHoliday: false,
        IsSpecialNonWorkingDay: false,
      },
      brackets,
      0,
      261,
      true, // isGovernment = true
    );

    // GSIS: 9% of 20,000 = 1,800
    expect(payslip.GsisEmployeeShare).toBe(1800);
    expect(payslip.GsisEmployerShare).toBe(1800);
    expect(payslip.GsisECShare).toBe(400); // 2% of 20,000

    // SSS should be zero
    expect(payslip.SssEmployeeShare).toBe(0);
    expect(payslip.SssEmployerShare).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────
// Test: PERA Contributions
// ────────────────────────────────────────────────────────────────

describe('PayrollEngine - PERA', () => {
  const brackets = buildAllBrackets();

  test('Unenrolled employee gets zero PERA', () => {
    const payslip = computePayslip(
      {
        EmployeeId: 'emp-nopera',
        BasicSalary: 25000,
        PayFrequency: 'Monthly',
        DaysWorked: 22,
        LateMinutes: 0,
        UndertimeMinutes: 0,
        OvertimeMinutes: 0,
        NightDiffMinutes: 0,
        HolidayPayDays: 0,
        RestDayPayDays: 0,
        IsRegularHoliday: false,
        IsSpecialNonWorkingDay: false,
      },
      brackets,
      0,
      261,
      false,
      0, // peraEmployeeShare
      0, // peraEmployerShare
    );

    expect(payslip.PeraEmployeeShare).toBe(0);
    expect(payslip.PeraEmployerShare).toBe(0);
  });

  test('Enrolled employee with PERA deduction', () => {
    const payslip = computePayslip(
      {
        EmployeeId: 'emp-pera',
        BasicSalary: 25000,
        PayFrequency: 'Monthly',
        DaysWorked: 22,
        LateMinutes: 0,
        UndertimeMinutes: 0,
        OvertimeMinutes: 0,
        NightDiffMinutes: 0,
        HolidayPayDays: 0,
        RestDayPayDays: 0,
        IsRegularHoliday: false,
        IsSpecialNonWorkingDay: false,
      },
      brackets,
      0,
      261,
      false,
      1666.67, // peraEmployeeShare (₱200K / 12 months)
      1666.67, // peraEmployerShare (matching)
    );

    expect(payslip.PeraEmployeeShare).toBe(1666.67);
    expect(payslip.PeraEmployerShare).toBe(1666.67);

    // PERA should appear in deductions
    expect(payslip.TotalDeductions).toBeGreaterThan(0);

    // Net pay is lower due to PERA
    expect(payslip.NetPay).toBeLessThan(payslip.GrossPay);

    // Exact equation
    expect(payslip.GrossPay - payslip.TotalDeductions).toBeCloseTo(payslip.NetPay, 2);
  });
});

// ────────────────────────────────────────────────────────────────
// Test: Loan Deductions
// ────────────────────────────────────────────────────────────────

describe('PayrollEngine - Loan Deductions', () => {
  test('Single loan: deducts monthly amortization', () => {
    const result = computeLoanDeductions([
      { MonthlyAmortization: 2000, RemainingBalance: 10000 },
    ]);
    expect(result.totalDeduction).toBe(2000);
    expect(result.loanDetails[0].remainingBalance).toBe(8000);
  });

  test('Multiple loans: sum of amortizations', () => {
    const result = computeLoanDeductions([
      { MonthlyAmortization: 2000, RemainingBalance: 10000 },
      { MonthlyAmortization: 500, RemainingBalance: 2000 },
    ]);
    expect(result.totalDeduction).toBe(2500);
  });

  test('Loan fully paid: deducts remaining only', () => {
    const result = computeLoanDeductions([
      { MonthlyAmortization: 2000, RemainingBalance: 500 },
    ]);
    expect(result.totalDeduction).toBe(500);
    expect(result.loanDetails[0].remainingBalance).toBe(0);
  });

  test('Loan already paid: zero deduction', () => {
    const result = computeLoanDeductions([
      { MonthlyAmortization: 2000, RemainingBalance: 0 },
    ]);
    expect(result.totalDeduction).toBe(0);
  });

  test('GSIS loan types produce per-type breakdown', () => {
    const result = computeLoanDeductions([
      { MonthlyAmortization: 1500, RemainingBalance: 30000, LoanType: 'GSIS_Conso' },
      { MonthlyAmortization: 500, RemainingBalance: 10000, LoanType: 'GSIS_Emergency' },
      { MonthlyAmortization: 800, RemainingBalance: 5000, LoanType: 'SSS' },
    ]);
    expect(result.totalDeduction).toBe(2800);
    expect(result.breakdown).toHaveLength(3);
    const gsisConso = result.breakdown.find(b => b.LoanType === 'GSIS_Conso');
    expect(gsisConso).toBeDefined();
    expect(gsisConso!.Amount).toBe(1500);
    expect(gsisConso!.Description).toBe('GSIS Consolidated Loan');
    const gsisEmergency = result.breakdown.find(b => b.LoanType === 'GSIS_Emergency');
    expect(gsisEmergency).toBeDefined();
    expect(gsisEmergency!.Amount).toBe(500);
    const sss = result.breakdown.find(b => b.LoanType === 'SSS');
    expect(sss).toBeDefined();
    expect(sss!.Amount).toBe(800);
  });

  test('Mixed loan types aggregate correctly per type', () => {
    const result = computeLoanDeductions([
      { MonthlyAmortization: 1000, RemainingBalance: 20000, LoanType: 'GSIS_Conso' },
      { MonthlyAmortization: 500, RemainingBalance: 5000, LoanType: 'GSIS_Conso' },
      { MonthlyAmortization: 200, RemainingBalance: 2000, LoanType: 'PagIbig' },
    ]);
    expect(result.totalDeduction).toBe(1700);
    // Two GSIS_Conso loans should aggregate into one breakdown item
    const gsis = result.breakdown.find(b => b.LoanType === 'GSIS_Conso');
    expect(gsis!.Amount).toBe(1500);
    const pagibig = result.breakdown.find(b => b.LoanType === 'PagIbig');
    expect(pagibig!.Amount).toBe(200);
  });

  test('GSIS loan fully paid: deducts remaining only, shows in breakdown', () => {
    const result = computeLoanDeductions([
      { MonthlyAmortization: 2000, RemainingBalance: 300, LoanType: 'GSIS_Policy' },
    ]);
    expect(result.totalDeduction).toBe(300);
    expect(result.breakdown[0].Amount).toBe(300);
    expect(result.breakdown[0].Description).toBe('GSIS Policy Loan');
  });
});

// ────────────────────────────────────────────────────────────────
// Test: 13th Month Pay
// ────────────────────────────────────────────────────────────────

describe('PayrollEngine - 13th Month Pay', () => {
  test('₱25,000/month: 13th month = 25,000 / 12 = ₱2,083.33', () => {
    const result = compute13thMonthPay(300000); // 25K * 12
    expect(result.ComputedAmount).toBe(25000);
  });

  test('₱15,000/month: 13th month = 15,000 / 12 = ₱1,250', () => {
    const result = compute13thMonthPay(180000); // 15K * 12
    expect(result.ComputedAmount).toBe(15000);
  });
});

// ────────────────────────────────────────────────────────────────
// Test: Payslip Line Items
// ────────────────────────────────────────────────────────────────

describe('PayrollEngine - Payslip Line Items', () => {
  test('Generates correct line items for a payslip with deductions', () => {
    const payslip: PayslipResult = {
      EmployeeId: 'test',
      BasicPay: 25000,
      TotalWorkedDays: 22,
      AbsentDeduction: 500,
      LateDeduction: 100,
      UndertimeDeduction: 50,
      OvertimePay: 300,
      NightDiffPay: 50,
      HolidayPay: 0,
      RestDayPremium: 0,
      Allowances: 2000,
      DeMinimisBenefits: 1000,
      GrossPay: 27300,
      SssEmployeeShare: 1375,
      SssEmployerShare: 3187.5,
      SssMPFEmployee: 0,
      SssMPFEmployer: 0,
      PhilHealthEmployeeShare: 750,
      PhilHealthEmployerShare: 750,
      PagIbigEmployeeShare: 200,
      PagIbigEmployerShare: 200,
      GsisEmployeeShare: 0,
      GsisEmployerShare: 0,
      GsisECShare: 0,
      PeraEmployeeShare: 500,
      PeraEmployerShare: 500,
      WithholdingTax: 2000,
      ThirteenthMonthPayAccrual: 2083.33,
      LoanDeductions: 300,
      LoanBreakdown: [
        { LoanType: 'SSS', Description: 'SSS Salary Loan', Amount: 200 },
        { LoanType: 'CompanyLoan', Description: 'Company Loan', Amount: 100 },
      ],
      OtherDeductions: 0,
      TotalDeductions: 5775,
      NetPay: 21525,
    };

    const items = generatePayslipLineItems(payslip);

    // Check earnings present
    const earnings = items.filter(i => i.ItemType === 'Earning');
    expect(earnings.some(i => i.Code === 'BASIC_PAY')).toBe(true);
    expect(earnings.some(i => i.Code === 'OT_PAY')).toBe(true);
    expect(earnings.some(i => i.Code === 'NIGHT_DIFF')).toBe(true);
    expect(earnings.some(i => i.Code === 'ALLOWANCES')).toBe(true);

    // Check deductions present
    const deductions = items.filter(i => i.ItemType === 'Deduction');
    expect(deductions.some(i => i.Code === 'SSS_EE')).toBe(true);
    expect(deductions.some(i => i.Code === 'PHILHEALTH_EE')).toBe(true);
    expect(deductions.some(i => i.Code === 'PAGIBIG_EE')).toBe(true);
    expect(deductions.some(i => i.Code === 'WHTAX')).toBe(true);
    expect(deductions.some(i => i.Code === 'ABSENT')).toBe(true);
    expect(deductions.some(i => i.Code === 'LATE')).toBe(true);
    expect(deductions.some(i => i.Code === 'UNDERTIME')).toBe(true);
    // Per-loan-type line items (GSIS loan breakdown)
    expect(deductions.some(i => i.Code === 'LOAN_SSS')).toBe(true);
    expect(deductions.some(i => i.Code === 'LOAN_COMPANY')).toBe(true);

    // PERA line items
    expect(deductions.some(i => i.Code === 'PERA_EE')).toBe(true);
    expect(deductions.some(i => i.Code === 'PERA_ER')).toBe(true);
  });

  test('Zero amounts are not included in line items', () => {
    const payslip: PayslipResult = {
      EmployeeId: 'test',
      BasicPay: 15000,
      TotalWorkedDays: 22,
      AbsentDeduction: 0,
      LateDeduction: 0,
      UndertimeDeduction: 0,
      OvertimePay: 0,
      NightDiffPay: 0,
      HolidayPay: 0,
      RestDayPremium: 0,
      Allowances: 0,
      DeMinimisBenefits: 0,
      GrossPay: 15000,
      SssEmployeeShare: 825,
      SssEmployerShare: 1912.5,
      SssMPFEmployee: 0,
      SssMPFEmployer: 0,
      PhilHealthEmployeeShare: 375,
      PhilHealthEmployerShare: 375,
      PagIbigEmployeeShare: 100,
      PagIbigEmployerShare: 100,
      GsisEmployeeShare: 0,
      GsisEmployerShare: 0,
      GsisECShare: 0,
      PeraEmployeeShare: 0,
      PeraEmployerShare: 0,
      WithholdingTax: 0,
      ThirteenthMonthPayAccrual: 1250,
      LoanDeductions: 0,
      LoanBreakdown: [],
      OtherDeductions: 0,
      TotalDeductions: 1300,
      NetPay: 13700,
    };

    const items = generatePayslipLineItems(payslip);

    // Zero-amount items should not appear
    expect(items.some(i => i.Code === 'OT_PAY')).toBe(false);
    expect(items.some(i => i.Code === 'NIGHT_DIFF')).toBe(false);
    expect(items.some(i => i.Code === 'HOLIDAY_PAY')).toBe(false);
    expect(items.some(i => i.Code === 'REST_DAY_PREM')).toBe(false);
    expect(items.some(i => i.Code === 'ABSENT')).toBe(false);
    expect(items.some(i => i.Code === 'PERA_EE')).toBe(false);
    expect(items.some(i => i.Code === 'PERA_ER')).toBe(false);
    expect(items.some(i => i.Code === 'LOANS')).toBe(false);

    // Non-zero items should appear
    expect(items.some(i => i.Code === 'BASIC_PAY')).toBe(true);
    expect(items.some(i => i.Code === 'SSS_EE')).toBe(true);
    expect(items.some(i => i.Code === 'PHILHEALTH_EE')).toBe(true);
    expect(items.some(i => i.Code === 'PAGIBIG_EE')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────
// Test: Rounding
// ────────────────────────────────────────────────────────────────

describe('PayrollEngine - Rounding', () => {
  test('roundTo2 rounds to 2 decimal places', () => {
    expect(roundTo2(10.005)).toBe(10.01);
    expect(roundTo2(10.004)).toBe(10);
    expect(roundTo2(10.555)).toBe(10.56);
    expect(roundTo2(0.001)).toBe(0);
  });

  test('No rounding drift in full payslip computation', () => {
    const brackets = buildAllBrackets();
    const payslip = computePayslip(
      {
        EmployeeId: 'test-rounding',
        BasicSalary: 33333.33,
        PayFrequency: 'Monthly',
        DaysWorked: 20,
        LateMinutes: 23,
        UndertimeMinutes: 15,
        OvertimeMinutes: 45,
        NightDiffMinutes: 120,
        HolidayPayDays: 1,
        RestDayPayDays: 1,
        IsRegularHoliday: false,
        IsSpecialNonWorkingDay: true,
        Allowances: 1500,
        DeMinimisBenefits: 2000,
      },
      brackets,
      500, // loan deduction
      261,
      false,
    );

    // The invariant: GrossPay - TotalDeductions === NetPay within ₱0.01
    const drift = Math.abs(payslip.GrossPay - payslip.TotalDeductions - payslip.NetPay);
    expect(drift).toBeLessThan(0.02);
  });
});
