/**
 * KPI and Promotion Evaluation Engine
 * Pure business logic functions for KPI achievement calculation and Promotion Readiness evaluation.
 */

export interface KpiItem {
  id?: string;
  metricType: 'Percentage' | 'Currency' | 'Numeric' | 'Milestone' | string;
  targetValue: number;
  actualValue: number;
  weightPercent: number;
}

export interface EmployeeDataForPromotion {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  basicSalary: number;
  dateHired: Date | string;
  departmentId: string;
  departmentName?: string;
  positionId: string;
  positionTitle?: string;
  jobGrade?: string;
  salaryGradeMin?: number;
  salaryGradeMax?: number;
}

export interface PromotionCriteriaConfig {
  minKpiScorePercent: number; // default 85%
  minPerformanceRating: number; // default 4.0
  minTenureMonths: number; // default 12
  requireCleanDisciplinary: boolean; // default true
  minCompetencyScore: number; // default 3.5
  recommendedSalaryIncreasePercent: number; // default 10%
}

export interface PromotionEvaluationResult {
  employeeId: string;
  employeeNo: string;
  fullName: string;
  currentSalary: number;
  departmentId: string;
  departmentName: string;
  currentPositionId: string;
  currentPositionTitle: string;
  currentJobGrade: string;
  
  // Evaluation factors
  kpiScorePercent: number;
  kpiEligible: boolean;
  performanceRating: number | null;
  performanceEligible: boolean;
  tenureMonths: number;
  tenureEligible: boolean;
  disciplinaryViolationsCount: number;
  disciplinaryEligible: boolean;
  competencyScoreAvg: number;
  competencyEligible: boolean;

  // Composite Readiness
  readinessScore: number; // 0 - 100
  eligibilityStatus: 'Due for Promotion' | 'High Potential' | 'Developing' | 'Disqualified';
  summaryReason: string;

  // Recommendations
  recommendedNextPositionId?: string;
  recommendedNextPositionTitle?: string;
  recommendedSalary: number;
  projectedSalaryIncreaseAmount: number;
  projectedSalaryIncreasePercent: number;
}

/**
 * Computes individual KPI achievement percentage.
 * Capped at 150% stretch limit.
 */
export function computeKpiAchievement(
  metricType: string,
  targetValue: number,
  actualValue: number
): number {
  if (metricType === 'Milestone') {
    return actualValue >= 1 ? 100 : 0;
  }

  if (targetValue <= 0) {
    return actualValue > 0 ? 100 : 0;
  }

  const rawPercent = (actualValue / targetValue) * 100;
  const capped = Math.min(Math.max(rawPercent, 0), 150);
  return Math.round(capped * 100) / 100;
}

/**
 * Computes overall weighted KPI score across an array of employee KPIs.
 */
export function computeWeightedKpiScore(kpis: KpiItem[]): number {
  if (!kpis || kpis.length === 0) return 0;

  const totalWeight = kpis.reduce((sum, k) => sum + (k.weightPercent || 0), 0);
  if (totalWeight <= 0) {
    // If no weights set, take simple average
    const totalAch = kpis.reduce((sum, k) => {
      const ach = computeKpiAchievement(k.metricType, k.targetValue, k.actualValue);
      return sum + ach;
    }, 0);
    return Math.round((totalAch / kpis.length) * 100) / 100;
  }

  const weightedSum = kpis.reduce((sum, k) => {
    const ach = computeKpiAchievement(k.metricType, k.targetValue, k.actualValue);
    return sum + (ach * (k.weightPercent / totalWeight));
  }, 0);

  return Math.round(weightedSum * 100) / 100;
}

/**
 * Calculates tenure in months between a date and a reference date (default now).
 */
export function calculateTenureMonths(startDate: Date | string, referenceDate: Date = new Date()): number {
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return 0;

  const yearsDiff = referenceDate.getFullYear() - start.getFullYear();
  const monthsDiff = referenceDate.getMonth() - start.getMonth();
  const daysDiff = referenceDate.getDate() - start.getDate();

  let months = yearsDiff * 12 + monthsDiff;
  if (daysDiff < 0) {
    months -= 1;
  }
  return Math.max(months, 0);
}

/**
 * Evaluates whether an employee is Due for Promotion based on KPIs, Performance, Tenure, Competency, and Disciplinary records.
 */
export function evaluatePromotionCandidate(
  employee: EmployeeDataForPromotion,
  criteria: PromotionCriteriaConfig,
  kpiItems: KpiItem[],
  latestPerformanceRating: number | null,
  activeDisciplinaryCount: number,
  competencyScoreAvg: number,
  candidateNextPosition?: { id: string; title: string; salaryGradeMin?: number; salaryGradeMax?: number },
  referenceDate: Date = new Date()
): PromotionEvaluationResult {
  const kpiScore = computeWeightedKpiScore(kpiItems);
  const tenureMonths = calculateTenureMonths(employee.dateHired, referenceDate);

  const kpiEligible = kpiScore >= criteria.minKpiScorePercent;
  const performanceEligible = latestPerformanceRating !== null
    ? latestPerformanceRating >= criteria.minPerformanceRating
    : false;
  const tenureEligible = tenureMonths >= criteria.minTenureMonths;
  const disciplinaryEligible = !criteria.requireCleanDisciplinary || activeDisciplinaryCount === 0;
  const competencyEligible = competencyScoreAvg >= criteria.minCompetencyScore;

  // Calculate Readiness Score (0-100)
  // 35% KPI + 25% Performance + 20% Tenure + 20% Competency
  const kpiComponent = Math.min((kpiScore / criteria.minKpiScorePercent) * 35, 35);
  const perfComponent = latestPerformanceRating
    ? Math.min((latestPerformanceRating / criteria.minPerformanceRating) * 25, 25)
    : 0;
  const tenureComponent = Math.min((tenureMonths / criteria.minTenureMonths) * 20, 20);
  const compComponent = competencyScoreAvg > 0
    ? Math.min((competencyScoreAvg / criteria.minCompetencyScore) * 20, 20)
    : 10; // baseline if not yet assessed

  let readinessScore = Math.round((kpiComponent + perfComponent + tenureComponent + compComponent) * 10) / 10;

  // Disciplinary penalty
  if (!disciplinaryEligible) {
    readinessScore = Math.round(readinessScore * 0.4 * 10) / 10; // 60% penalty
  }

  // Determine eligibility status
  let eligibilityStatus: 'Due for Promotion' | 'High Potential' | 'Developing' | 'Disqualified';
  let summaryReason = '';

  if (!disciplinaryEligible) {
    eligibilityStatus = 'Disqualified';
    summaryReason = `Active disciplinary record (${activeDisciplinaryCount} incident/NTE)`;
  } else if (kpiEligible && performanceEligible && tenureEligible && competencyEligible) {
    eligibilityStatus = 'Due for Promotion';
    summaryReason = `Exceeds all criteria: KPI ${kpiScore}%, Rating ${latestPerformanceRating}, Tenure ${tenureMonths}m`;
  } else if (readinessScore >= 70 && disciplinaryEligible) {
    eligibilityStatus = 'High Potential';
    const missing: string[] = [];
    if (!kpiEligible) missing.push(`KPI (${kpiScore}% < ${criteria.minKpiScorePercent}%)`);
    if (!performanceEligible) missing.push(`Rating (${latestPerformanceRating || 0} < ${criteria.minPerformanceRating})`);
    if (!tenureEligible) missing.push(`Tenure (${tenureMonths}m < ${criteria.minTenureMonths}m)`);
    if (!competencyEligible) missing.push(`Competency (${competencyScoreAvg} < ${criteria.minCompetencyScore})`);
    summaryReason = `On track for next cycle. Pending: ${missing.join(', ')}`;
  } else {
    eligibilityStatus = 'Developing';
    summaryReason = `Building competencies and targets (Readiness ${readinessScore}%)`;
  }

  // Recommended Salary
  const currentSalary = Number(employee.basicSalary) || 0;
  const hikePercent = criteria.recommendedSalaryIncreasePercent || 10;
  const targetMin = candidateNextPosition?.salaryGradeMin ? Number(candidateNextPosition.salaryGradeMin) : 0;
  
  const percentageHikeSalary = currentSalary * (1 + (hikePercent / 100));
  const recommendedSalary = Math.round(Math.max(percentageHikeSalary, targetMin) * 100) / 100;
  const projectedIncreaseAmount = Math.round((recommendedSalary - currentSalary) * 100) / 100;
  const projectedSalaryIncreasePercent = currentSalary > 0
    ? Math.round(((projectedIncreaseAmount / currentSalary) * 100) * 100) / 100
    : 0;

  return {
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    fullName: `${employee.firstName} ${employee.lastName}`,
    currentSalary,
    departmentId: employee.departmentId,
    departmentName: employee.departmentName || '',
    currentPositionId: employee.positionId,
    currentPositionTitle: employee.positionTitle || '',
    currentJobGrade: employee.jobGrade || 'N/A',
    
    kpiScorePercent: kpiScore,
    kpiEligible,
    performanceRating: latestPerformanceRating,
    performanceEligible,
    tenureMonths,
    tenureEligible,
    disciplinaryViolationsCount: activeDisciplinaryCount,
    disciplinaryEligible,
    competencyScoreAvg,
    competencyEligible,

    readinessScore,
    eligibilityStatus,
    summaryReason,

    recommendedNextPositionId: candidateNextPosition?.id,
    recommendedNextPositionTitle: candidateNextPosition?.title,
    recommendedSalary,
    projectedSalaryIncreaseAmount: projectedIncreaseAmount,
    projectedSalaryIncreasePercent: projectedSalaryIncreasePercent
  };
}
