import { test, expect } from '@playwright/test';
import { login, URLS } from './helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard loads with stat cards', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Dashboard');
    await expect(page.locator('text=Welcome to HRIS Philippines')).toBeVisible();

    const statCards = page.locator('.grid.gap-4 > .bg-white.rounded-xl');
    await expect(statCards).toHaveCount(5);
  });

  test('stat cards display correct labels', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Total Employees')).toBeVisible();
    await expect(page.locator('text=Active Employees')).toBeVisible();
    await expect(page.locator('text=On Leave Today')).toBeVisible();
    await expect(page.locator('text=Pending Leaves')).toBeVisible();
    await expect(page.locator('text=Departments')).toBeVisible();
  });

  test('quick actions section renders', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Quick Actions')).toBeVisible();
    await expect(page.locator('text=Clock In/Out')).toBeVisible();
    await expect(page.locator('text=Request Leave')).toBeVisible();
    await expect(page.locator('text=View Payslip')).toBeVisible();
    await expect(page.locator('text=My DTR')).toBeVisible();
  });

  test('recent activity section renders', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Recent Activity')).toBeVisible();
    await expect(page.locator('text=Attendance recorded')).toBeVisible();
    await expect(page.locator('text=Leave request approved')).toBeVisible();
    await expect(page.locator('text=Payslip generated')).toBeVisible();
  });
});
