import {
  computeKpiAchievement,
  computeWeightedKpiScore,
  calculateTenureMonths,
  evaluatePromotionCandidate,
  PromotionCriteriaConfig,
  EmployeeDataForPromotion,
  KpiItem
} from '../services/kpiService';

describe('KPI and Promotion Engine Unit Tests', () => {
  describe('computeKpiAchievement', () => {
    it('should calculate standard percentage achievement correctly', () => {
      expect(computeKpiAchievement('Percentage', 100, 95)).toBe(95);
      expect(computeKpiAchievement('Currency', 500000, 600000)).toBe(120);
      expect(computeKpiAchievement('Numeric', 50, 40)).toBe(80);
    });

    it('should handle milestone achievement correctly (binary)', () => {
      expect(computeKpiAchievement('Milestone', 1, 1)).toBe(100);
      expect(computeKpiAchievement('Milestone', 1, 0)).toBe(0);
    });

    it('should enforce 150% maximum cap for stretch performance', () => {
      expect(computeKpiAchievement('Numeric', 10, 25)).toBe(150); // 250% raw -> capped at 150%
    });

    it('should safely handle 0 or negative targets without dividing by zero', () => {
      expect(computeKpiAchievement('Numeric', 0, 5)).toBe(100);
      expect(computeKpiAchievement('Numeric', 0, 0)).toBe(0);
    });
  });

  describe('computeWeightedKpiScore', () => {
    it('should compute weighted KPI achievement accurately', () => {
      const kpis: KpiItem[] = [
        { metricType: 'Percentage', targetValue: 100, actualValue: 90, weightPercent: 50 }, // 90 * 0.5 = 45
        { metricType: 'Numeric', targetValue: 20, actualValue: 20, weightPercent: 30 }, // 100 * 0.3 = 30
        { metricType: 'Milestone', targetValue: 1, actualValue: 1, weightPercent: 20 }, // 100 * 0.2 = 20
      ];
      // Total = 45 + 30 + 20 = 95
      expect(computeWeightedKpiScore(kpis)).toBe(95);
    });

    it('should return 0 for empty KPI list', () => {
      expect(computeWeightedKpiScore([])).toBe(0);
    });
  });

  describe('calculateTenureMonths', () => {
    it('should accurately calculate months between two dates', () => {
      const start = '2025-01-15';
      const ref = new Date('2026-07-15');
      expect(calculateTenureMonths(start, ref)).toBe(18);
    });
  });

  describe('evaluatePromotionCandidate', () => {
    const defaultCriteria: PromotionCriteriaConfig = {
      minKpiScorePercent: 85,
      minPerformanceRating: 4.0,
      minTenureMonths: 12,
      requireCleanDisciplinary: true,
      minCompetencyScore: 3.5,
      recommendedSalaryIncreasePercent: 10
    };

    const mockEmployee: EmployeeDataForPromotion = {
      id: 'emp-001',
      employeeNo: 'EMP-2024-001',
      firstName: 'Maria',
      lastName: 'Santos',
      basicSalary: 40000,
      dateHired: '2024-01-01',
      departmentId: 'dept-eng',
      departmentName: 'Engineering',
      positionId: 'pos-jr-dev',
      positionTitle: 'Junior Developer',
      jobGrade: 'Grade 1'
    };

    const candidateNextPosition = {
      id: 'pos-mid-dev',
      title: 'Mid-Level Developer',
      salaryGradeMin: 50000,
      salaryGradeMax: 65000
    };

    it('should flag an employee as "Due for Promotion" when all criteria are met', () => {
      const kpis: KpiItem[] = [
        { metricType: 'Percentage', targetValue: 100, actualValue: 95, weightPercent: 100 }
      ];
      const refDate = new Date('2025-06-01'); // 17 months tenure

      const result = evaluatePromotionCandidate(
        mockEmployee,
        defaultCriteria,
        kpis,
        4.5, // Rating >= 4.0
        0,   // Zero disciplinary
        4.2, // Competency >= 3.5
        candidateNextPosition,
        refDate
      );

      expect(result.eligibilityStatus).toBe('Due for Promotion');
      expect(result.kpiEligible).toBe(true);
      expect(result.performanceEligible).toBe(true);
      expect(result.tenureEligible).toBe(true);
      expect(result.disciplinaryEligible).toBe(true);
      expect(result.competencyEligible).toBe(true);
      expect(result.readinessScore).toBeGreaterThanOrEqual(85);

      // Salary recommendation: 40,000 + 10% = 44,000, but target min is 50,000
      // So recommendedSalary must be bumped to targetMin (50,000)
      expect(result.recommendedSalary).toBe(50000);
      expect(result.projectedSalaryIncreaseAmount).toBe(10000);
      expect(result.projectedSalaryIncreasePercent).toBe(25);
    });

    it('should mark an employee as "Disqualified" if they have an active disciplinary incident', () => {
      const kpis: KpiItem[] = [
        { metricType: 'Percentage', targetValue: 100, actualValue: 100, weightPercent: 100 }
      ];
      const refDate = new Date('2025-06-01');

      const result = evaluatePromotionCandidate(
        mockEmployee,
        defaultCriteria,
        kpis,
        4.8,
        1, // 1 active disciplinary record
        4.5,
        candidateNextPosition,
        refDate
      );

      expect(result.eligibilityStatus).toBe('Disqualified');
      expect(result.disciplinaryEligible).toBe(false);
      expect(result.summaryReason).toContain('disciplinary');
    });

    it('should mark as "High Potential" if candidate has strong performance but tenure is slightly short', () => {
      const kpis: KpiItem[] = [
        { metricType: 'Percentage', targetValue: 100, actualValue: 92, weightPercent: 100 }
      ];
      const refDate = new Date('2024-10-01'); // 9 months tenure (< 12 months criteria)

      const result = evaluatePromotionCandidate(
        mockEmployee,
        defaultCriteria,
        kpis,
        4.2,
        0,
        3.8,
        candidateNextPosition,
        refDate
      );

      expect(result.eligibilityStatus).toBe('High Potential');
      expect(result.tenureEligible).toBe(false);
      expect(result.readinessScore).toBeGreaterThanOrEqual(70);
    });

    it('should apply percentage salary increase if it exceeds target position min', () => {
      const seniorCandidatePosition = {
        id: 'pos-sr-dev',
        title: 'Senior Developer',
        salaryGradeMin: 42000, // lower than 40k + 10% (44k)
        salaryGradeMax: 60000
      };

      const result = evaluatePromotionCandidate(
        mockEmployee,
        defaultCriteria,
        [{ metricType: 'Percentage', targetValue: 100, actualValue: 90, weightPercent: 100 }],
        4.0,
        0,
        4.0,
        seniorCandidatePosition,
        new Date('2025-06-01')
      );

      // 40,000 * 1.10 = 44,000 > 42,000
      expect(result.recommendedSalary).toBe(44000);
      expect(result.projectedSalaryIncreaseAmount).toBe(4000);
      expect(result.projectedSalaryIncreasePercent).toBe(10);
    });
  });
});
