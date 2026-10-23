import { Page, expect } from '@playwright/test';

export const TEST_CREDENTIALS = {
  email: 'admin@system.com',
  password: 'Admin123!',
  tenantCode: 'SYSTEM',
};

export const URLS = {
  login: '/login',
  dashboard: '/',
  employees: '/employees',
  attendance: '/attendance',
  attendanceDtr: '/attendance/dtr',
  attendanceOvertime: '/attendance/overtime',
  attendanceShifts: '/attendance/shifts',
  attendanceSchedules: '/attendance/schedules',
  attendanceGeofences: '/attendance/geofences',
  attendanceHolidays: '/attendance/holidays',
  attendanceDevices: '/attendance/devices',
  leave: '/leave',
  leaveCalendar: '/leave/calendar',
  leaveTypes: '/leave/types',
  leaveApprovalChains: '/leave/approval-chains',
  leaveYearEnd: '/leave/year-end',
  payroll: '/payroll',
  orgStructure: '/org-structure',
  orgDepartments: '/org-structure/departments',
  orgPositions: '/org-structure/positions',
  admin: '/admin',
  adminTenants: '/admin/tenants',
  adminUsers: '/admin/users',
  adminRoles: '/admin/roles',
};

export async function login(page: Page, email?: string, password?: string) {
  // With storageState, the user should already be logged in
  // Just navigate to the page and verify we're not on login
  await page.goto(URLS.dashboard);
  // Don't use networkidle — Vite HMR WebSocket prevents it from resolving
  await page.waitForLoadState('domcontentloaded');
  
  // If we're redirected to login, then storage state didn't work - do manual login
  if (page.url().includes('/login')) {
    const e = email || TEST_CREDENTIALS.email;
    const p = password || TEST_CREDENTIALS.password;

    await page.goto(URLS.login);
    await page.waitForLoadState('domcontentloaded');
    // Wait for React to stabilize (AuthContext /auth/me call causes re-renders)
    await page.locator('button[type="submit"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);

    await page.fill('input[type="email"]', e);
    await page.fill('input[type="password"]', p);
    
    // Fill tenant code if available
    const tenantInput = page.locator('input[placeholder="SYSTEM"]');
    if (await tenantInput.isVisible()) {
      await tenantInput.clear();
      await tenantInput.fill(TEST_CREDENTIALS.tenantCode);
    }
    
    await page.click('button[type="submit"]');

    await page.waitForURL(URLS.dashboard, { timeout: 10000 });
    await expect(page).toHaveURL(URLS.dashboard);
  }
}

export async function logout(page: Page) {
  const logoutButton = page.locator('button', { hasText: 'Logout' });
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
    await page.waitForURL(URLS.login, { timeout: 5000 });
  }
}

export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
}
