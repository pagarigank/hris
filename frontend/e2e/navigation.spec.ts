import { test, expect } from '@playwright/test';
import { login, URLS } from './helpers/auth';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar navigation works', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();

    const navItems = ['Dashboard', 'Employees'];
    for (const item of navItems) {
      const navLink = sidebar.locator(`a:has-text("${item}")`);
      await expect(navLink).toBeVisible();
    }
    // Attendance, Leave, Payroll, Org Structure are buttons (expandable), not links
    for (const item of ['Attendance', 'Leave', 'Payroll', 'Org Structure']) {
      const btn = sidebar.locator(`button:has-text("${item}")`);
      await expect(btn).toBeVisible();
    }
  });

  test('attendance expandable nav in sidebar', async ({ page }) => {
    const sidebar = page.locator('aside');
    const attendanceBtn = sidebar.locator('button:has-text("Attendance")');
    await expect(attendanceBtn).toBeVisible();

    await attendanceBtn.click();

    // Attendance sub-nav items should appear
    await expect(sidebar.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'DTR' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Overtime' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Shifts' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Schedules' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Geofences' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Holidays' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Devices' })).toBeVisible();
  });

  test('leave expandable nav in sidebar', async ({ page }) => {
    const sidebar = page.locator('aside');
    const leaveBtn = sidebar.locator('button:has-text("Leave")');
    await expect(leaveBtn).toBeVisible();

    await leaveBtn.click();

    await expect(sidebar.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Calendar', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Leave Types' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Approval Chains' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Year-End' })).toBeVisible();
  });

  test('org structure expandable nav in sidebar', async ({ page }) => {
    const sidebar = page.locator('aside');
    const orgBtn = sidebar.locator('button:has-text("Org Structure")');
    await expect(orgBtn).toBeVisible();
    
    await orgBtn.click();
    
    await expect(sidebar.locator('a:has-text("Departments")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("Positions")')).toBeVisible();
  });

  test('active route highlights in sidebar', async ({ page }) => {
    // Expand Attendance first
    const sidebar = page.locator('aside');
    const attendanceBtn = sidebar.locator('button:has-text("Attendance")');
    await attendanceBtn.click();
    
    // Navigate to attendance sub-page
    await page.goto(URLS.attendanceDtr);
    await page.waitForLoadState('networkidle');

    // The DTR link should be highlighted
    const dtrLink = sidebar.locator('a:has-text("DTR")');
    await expect(dtrLink).toHaveClass(/bg-primary-50/);
  });

  test('branding links to dashboard', async ({ page }) => {
    const branding = page.locator('nav span:has-text("HRIS Philippines")');
    await expect(branding).toBeVisible();
  });

  test('user name displays in header', async ({ page }) => {
    const userName = page.locator('nav span.text-sm');
    await expect(userName).toBeVisible();
  });

  test('logout button works from header', async ({ page }) => {
    const logoutBtn = page.locator('nav button:has-text("Logout")');
    await expect(logoutBtn).toBeVisible();
    
    await logoutBtn.click();
    await page.waitForURL(URLS.login, { timeout: 5000 });
    await expect(page).toHaveURL(URLS.login);
  });
});
