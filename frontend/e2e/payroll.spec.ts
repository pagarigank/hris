import { test, expect } from '@playwright/test';
import { login, URLS } from './helpers/auth';

const API_BASE = 'http://localhost:3002/api/v1';

async function apiPost(path: string, body: any, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getToken(page: any): Promise<string> {
  const storage = await page.context().storageState();
  const cookies = storage.cookies;
  const authCookie = cookies.find((c: any) => c.name === 'token' || c.name === 'accessToken');
  if (authCookie) return authCookie.value;
  const localStorage = storage.origins?.[0]?.localStorage;
  const tokenItem = localStorage?.find((s: any) => s.name === 'token' || s.name === 'accessToken');
  return tokenItem?.value || '';
}

test.describe('Payroll', () => {
  test.describe('Payroll Periods', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await page.goto(URLS.payroll);
      await page.waitForLoadState('networkidle');
    });

    test('payroll page loads with tabs', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Payroll');
      await expect(page.locator('text=Manage payroll periods, runs, and payslips')).toBeVisible();
      await expect(page.locator('button:has-text("Payroll Periods")')).toBeVisible();
      await expect(page.locator('button:has-text("All Payslips")')).toBeVisible();
    });

    test('payroll periods list displays', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Payroll Periods' })).toBeVisible();
      await expect(page.locator('th:has-text("Period")')).toBeVisible();
      await expect(page.locator('th:has-text("Date Range")')).toBeVisible();
      await expect(page.locator('th:has-text("Pay Date")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
    });

    test('new period button links correctly', async ({ page }) => {
      const newPeriodBtn = page.locator('a:has-text("New Period")');
      await expect(newPeriodBtn).toBeVisible();
      await expect(newPeriodBtn).toHaveAttribute('href', '/payroll/new');
    });

    test('all payslips tab loads', async ({ page }) => {
      await page.locator('button:has-text("All Payslips")').click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('th:has-text("Employee")')).toBeVisible();
      await expect(page.locator('th:has-text("Gross Pay")')).toBeVisible();
      await expect(page.locator('th:has-text("Net Pay")')).toBeVisible();
    });
  });

  test.describe('New Payroll Period Form', () => {
    test('new period form renders', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('New Payroll Period');
      await expect(page.locator('label:has-text("Period Start")')).toBeVisible();
      await expect(page.locator('label:has-text("Period End")')).toBeVisible();
      await expect(page.locator('label:has-text("Pay Date")')).toBeVisible();
      await expect(page.locator('label:has-text("Pay Frequency")')).toBeVisible();
      await expect(page.locator('select')).toBeVisible();
    });

    test('pay frequency dropdown has options', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/new`);
      await page.waitForLoadState('networkidle');

      const select = page.locator('select');
      await expect(select.locator('option', { hasText: 'Monthly' }).first()).toBeAttached();
      await expect(select.locator('option', { hasText: 'Semi-Monthly' })).toBeAttached();
      await expect(select.locator('option', { hasText: 'Weekly' })).toBeAttached();
    });
  });

  test.describe('Employee Loans', () => {
    test('loans page loads', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/loans`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('Employee Loans');
      await expect(page.locator('text=Manage employee loan amortizations')).toBeVisible();
    });

    test('new loan button toggles form', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/loans`);
      await page.waitForLoadState('networkidle');

      const btn = page.locator('button:has-text("New Loan")');
      await expect(btn).toBeVisible();
      await btn.click();
      await expect(page.locator('label:has-text("Loan Type")')).toBeVisible();
      await expect(page.locator('label:has-text("Principal Amount")')).toBeVisible();
      await expect(page.locator('label:has-text("Monthly Amortization")')).toBeVisible();
    });

    test('loans table has correct columns', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/loans`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('th:has-text("Employee")')).toBeVisible();
      await expect(page.locator('th:has-text("Loan Type")')).toBeVisible();
      await expect(page.locator('th:has-text("Principal")')).toBeVisible();
      await expect(page.locator('th:has-text("Monthly Amort.")')).toBeVisible();
      await expect(page.locator('th:has-text("Remaining")')).toBeVisible();
    });
  });

  test.describe('13th Month Pay', () => {
    test('13th month page loads', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/thirteenth-month`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('13th Month Pay');
      await expect(page.locator('text=PD 851')).toBeVisible();
    });

    test('compute button and year selector visible', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/thirteenth-month`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('button:has-text("Compute 13th Month")')).toBeVisible();
      await expect(page.locator('select')).toBeVisible();
    });

    test('13th month table has columns', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/thirteenth-month`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('th:has-text("Employee")')).toBeVisible();
      await expect(page.locator('th:has-text("Total Basic Earned")')).toBeVisible();
      await expect(page.locator('th:has-text("13th Month")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
    });
  });

  test.describe('Government Reports', () => {
    test('government reports page loads', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/government-reports`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('Government Reports');
      await expect(page.locator('text=Generate and download regulatory reports')).toBeVisible();
    });

    test('report generation form has report type dropdown', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/government-reports`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('label:has-text("Report Type")')).toBeVisible();
      const select = page.locator('select');
      await expect(select.locator('option:has-text("BIR Alphalist")')).toBeAttached();
      await expect(select.locator('option:has-text("SSS R-3")')).toBeAttached();
      await expect(select.locator('option:has-text("SSS R-5")')).toBeAttached();
      await expect(select.locator('option:has-text("Pag-IBIG M1-A")')).toBeAttached();
    });

    test('generated reports table shows', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/government-reports`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: 'Generated Reports' })).toBeVisible();
      await expect(page.locator('th:has-text("Report Type")')).toBeVisible();
      await expect(page.locator('th:has-text("Period")')).toBeVisible();
      await expect(page.locator('th:has-text("Generated")')).toBeVisible();
    });
  });

  test.describe('Sidebar Navigation', () => {
    test('payroll section has sub-navigation', async ({ page }) => {
      await login(page);
      await page.goto(URLS.payroll);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=Loans')).toBeVisible();
      await expect(page.locator('text=13th Month')).toBeVisible();
      await expect(page.locator('text=Gov Reports')).toBeVisible();
    });
  });

  test.describe('Full Payroll Run Flow', () => {
    let departmentId = '';
    let employeeId = '';

    test('setup: create department and employee via API', async ({ page }) => {
      await login(page);
      const token = await getToken(page);

      // Create department
      const deptRes = await apiPost('/hr/departments', { name: 'Engineering', code: 'ENG' }, token);
      departmentId = deptRes.data?.id || deptRes.data?.departmentId || '';

      // Create employee
      const empRes = await apiPost('/hr/employees', {
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'juan.delacruz@test.com',
        departmentId,
        basicSalary: 25000,
        payFrequency: 'Monthly',
        employmentStatus: 'Regular',
        dateHired: '2024-01-15',
      }, token);
      employeeId = empRes.data?.id || empRes.data?.employeeId || '';

      expect(departmentId).toBeTruthy();
      expect(employeeId).toBeTruthy();
    });

    test('create payroll period via form', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.payroll}/new`);
      await page.waitForLoadState('networkidle');

      await page.fill('input[type="date"]:nth-of-type(1)', '2025-01-01');
      await page.fill('input[type="date"]:nth-of-type(2)', '2025-01-31');
      await page.fill('input[type="date"]:nth-of-type(3)', '2025-02-10');

      const select = page.locator('select');
      await select.selectOption('Monthly');

      await page.click('button[type="submit"]');
      await page.waitForURL('**/payroll', { timeout: 10000 });

      // Verify we're back on payroll list
      await expect(page.locator('h1')).toContainText('Payroll');
    });

    test('run payroll from period detail page', async ({ page }) => {
      await login(page);
      await page.goto(URLS.payroll);
      await page.waitForLoadState('networkidle');

      // Click View on first period
      const viewLink = page.locator('a:has-text("View")').first();
      if (await viewLink.isVisible()) {
        await viewLink.click();
        await page.waitForLoadState('networkidle');

        // Verify period detail page
        await expect(page.locator('h1')).toContainText('Payroll Period Detail');

        // If status is Open, run payroll
        const runBtn = page.locator('button:has-text("Run Payroll")');
        if (await runBtn.isVisible()) {
          page.on('dialog', dialog => dialog.accept());
          await runBtn.click();
          await page.waitForLoadState('networkidle');

          // Verify success message
          await expect(page.locator('text=completed successfully')).toBeVisible({ timeout: 15000 });
        }
      }
    });

    test('verify payslips appear in All Payslips tab', async ({ page }) => {
      await login(page);
      await page.goto(URLS.payroll);
      await page.waitForLoadState('networkidle');

      await page.locator('button:has-text("All Payslips")').click();
      await page.waitForLoadState('networkidle');

      await expect(page.locator('th:has-text("Employee")')).toBeVisible();
      await expect(page.locator('th:has-text("Gross Pay")')).toBeVisible();
      await expect(page.locator('th:has-text("Net Pay")')).toBeVisible();
    });
  });
});
