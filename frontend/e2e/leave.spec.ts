import { test, expect } from '@playwright/test';
import { login, URLS } from './helpers/auth';

test.describe('Leave', () => {
  test.describe('Leave Dashboard', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await page.goto(URLS.leave);
      await page.waitForLoadState('networkidle');
    });

    test('leave dashboard loads', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Leave Management');
      await expect(page.locator('text=View your leave credits and request leave')).toBeVisible();
    });

    test('leave credits section displays', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Leave Credits' })).toBeVisible();
    });

    test('recent requests table loads', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Recent Leave Requests' })).toBeVisible();

      const table = page.locator('table');
      await expect(table).toBeVisible();

      await expect(page.locator('th:has-text("Leave Type")')).toBeVisible();
      await expect(page.locator('th:has-text("Dates")')).toBeVisible();
      await expect(page.locator('th:has-text("Days")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
    });

    test('request leave button links correctly', async ({ page }) => {
      const requestBtn = page.locator('a:has-text("Request Leave")');
      await expect(requestBtn).toBeVisible();
      await expect(requestBtn).toHaveAttribute('href', '/leave/request');
    });

    test('calendar button links correctly', async ({ page }) => {
      const calendarBtn = page.getByRole('link', { name: '📅 Calendar' });
      await expect(calendarBtn).toBeVisible();
      await expect(calendarBtn).toHaveAttribute('href', '/leave/calendar');
    });
  });

  test.describe('Leave Request Form', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await page.goto('/leave/request');
      await page.waitForLoadState('networkidle');
    });

    test('leave request form opens', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Request Leave');
      await expect(page.locator('a:has-text("Back to Leave")')).toBeVisible();
    });

    test('form has required fields', async ({ page }) => {
      await expect(page.locator('select')).toBeVisible();
      await expect(page.locator('input[type="date"]').first()).toBeVisible();
      await expect(page.locator('textarea')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('form has half-day and LWOP checkboxes', async ({ page }) => {
      await expect(page.locator('text=Half Day')).toBeVisible();
      await expect(page.locator('text=Leave Without Pay (LWOP)')).toBeVisible();
    });

    test('form validation works', async ({ page }) => {
      const submitBtn = page.locator('button[type="submit"]');
      await submitBtn.click();

      await expect(page.locator('select')).toHaveAttribute('required', '');
    });
  });

  test.describe('Leave Calendar', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await page.goto(URLS.leaveCalendar);
      await page.waitForLoadState('networkidle');
    });

    test('calendar page loads', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Leave Calendar');
      await expect(page.locator('text=Approved leaves for the team')).toBeVisible();
    });

    test('calendar has month navigation', async ({ page }) => {
      await expect(page.locator('button:has-text("←")')).toBeVisible();
      await expect(page.locator('button:has-text("→")')).toBeVisible();
    });

    test('calendar has day headers', async ({ page }) => {
      for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
        await expect(page.locator(`text=${day}`).first()).toBeVisible();
      }
    });

    test('department filter is present', async ({ page }) => {
      const select = page.locator('select');
      await expect(select).toBeVisible();
      await expect(select).toContainText('All Departments');
    });
  });

  test.describe('Leave Types Management', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await page.goto(URLS.leaveTypes);
      await page.waitForLoadState('networkidle');
    });

    test('leave types page loads', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Leave Types');
      await expect(page.locator('text=Configure leave types')).toBeVisible();
    });

    test('add leave type button present', async ({ page }) => {
      const addBtn = page.locator('button:has-text("Add Leave Type")');
      await expect(addBtn).toBeVisible();
    });

    test('leave types table has expected columns', async ({ page }) => {
      await expect(page.locator('th:has-text("Code")')).toBeVisible();
      await expect(page.locator('th:has-text("Name")')).toBeVisible();
      await expect(page.locator('th:has-text("Accrual/Month")')).toBeVisible();
      await expect(page.locator('th:has-text("Actions")')).toBeVisible();
    });
  });

  test.describe('Approval Chains', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await page.goto(URLS.leaveApprovalChains);
      await page.waitForLoadState('networkidle');
    });

    test('approval chains page loads', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Approval Chains');
      await expect(page.locator('text=Configure per-department')).toBeVisible();
    });

    test('add step button present', async ({ page }) => {
      const addBtn = page.locator('button:has-text("Add Step")');
      await expect(addBtn).toBeVisible();
    });
  });

  test.describe('Year-End Processing', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await page.goto(URLS.leaveYearEnd);
      await page.waitForLoadState('networkidle');
    });

    test('year-end page loads', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Year-End Leave Processing');
    });

    test('processing year selector is present', async ({ page }) => {
      await expect(page.locator('select')).toBeVisible();
    });

    test('process button is present', async ({ page }) => {
      const processBtn = page.locator('button:has-text("Process Year-End")');
      await expect(processBtn).toBeVisible();
    });

    test('warning message displays', async ({ page }) => {
      await expect(page.locator('text=Carry-over').first()).toBeVisible();
    });
  });
});
