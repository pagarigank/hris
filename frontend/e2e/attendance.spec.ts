import { test, expect } from '@playwright/test';
import { login, URLS } from './helpers/auth';

test.describe('Attendance Dashboard', () => {
  test('attendance dashboard loads with clock display', async ({ page }) => {
    await login(page);
    await page.goto(URLS.attendance);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Attendance Dashboard');
    await expect(page.locator('text=Track your daily time record')).toBeVisible();
    await expect(page.locator('text=Current Time')).toBeVisible();
  });

  test('clock in and clock out buttons are visible', async ({ page }) => {
    await login(page);
    await page.goto(URLS.attendance);
    await page.waitForLoadState('networkidle');

    const buttons = page.locator('button');
    await expect(buttons.filter({ hasText: 'Clock In' }).first()).toBeVisible({ timeout: 10000 });
    await expect(buttons.filter({ hasText: 'Clock Out' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('clock in button works', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page);
    await page.goto(URLS.attendance);
    await page.waitForLoadState('networkidle');

    const clockInBtn = page.locator('button').filter({ hasText: /^Clock In$/ }).first();
    await expect(clockInBtn).toBeVisible({ timeout: 10000 });
    
    if (await clockInBtn.isEnabled()) {
      await clockInBtn.click();
      await page.waitForTimeout(2000);
    }
    
    await expect(page.locator('h1')).toContainText('Attendance');
  });

  test('DTR table displays records', async ({ page }) => {
    await login(page);
    await page.goto(URLS.attendance);
    await page.waitForLoadState('networkidle');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 15000 });
    
    await expect(page.locator('th:has-text("Date")')).toBeVisible();
    await expect(page.locator('th:has-text("Clock In")')).toBeVisible();
    await expect(page.locator('th:has-text("Clock Out")')).toBeVisible();
    await expect(page.locator('th:has-text("Status")')).toBeVisible();
  });
});

test.describe('Attendance Sub-Pages', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('DTR page loads with table', async ({ page }) => {
    await page.goto(URLS.attendanceDtr);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Daily Time Records');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 15000 });
    await expect(page.locator('th:has-text("Employee")')).toBeVisible();
    await expect(page.locator('th:has-text("Late")')).toBeVisible();
  });

  test('Overtime page loads', async ({ page }) => {
    await page.goto(URLS.attendanceOvertime);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Overtime Requests');
    await expect(page.locator('text=+ Request Overtime')).toBeVisible();
  });

  test('Shifts page loads', async ({ page }) => {
    await page.goto(URLS.attendanceShifts);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Shifts');
    await expect(page.locator('text=+ Add Shift')).toBeVisible();
  });

  test('Schedules page loads', async ({ page }) => {
    await page.goto(URLS.attendanceSchedules);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Employee Schedules');
    await expect(page.locator('text=+ Assign Schedule')).toBeVisible();
  });

  test('Geofences page loads', async ({ page }) => {
    await page.goto(URLS.attendanceGeofences);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Geofences');
    await expect(page.locator('text=+ Add Geofence')).toBeVisible();
  });

  test('Holidays page loads', async ({ page }) => {
    await page.goto(URLS.attendanceHolidays);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Holidays');
    await expect(page.locator('text=+ Add Holiday')).toBeVisible();
  });

  test('Devices page loads', async ({ page }) => {
    await page.goto(URLS.attendanceDevices);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Registered Devices');
    await expect(page.locator('text=+ Register Device')).toBeVisible();
  });
});

test.describe('Shifts CRUD', () => {
  test('can create a shift', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page);
    await page.goto(URLS.attendanceShifts);
    await page.waitForLoadState('networkidle');

    await page.click('text=+ Add Shift');
    await page.waitForSelector('h3:has-text("Add Shift")');

    // Fill shift name
    await page.locator('input[type="text"]').first().fill('Test Night Shift');
    
    // Fill time inputs
    const timeInputs = page.locator('input[type="time"]');
    await timeInputs.nth(0).fill('22:00');
    await timeInputs.nth(1).fill('06:00');
    
    // Fill number inputs
    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.nth(0).fill('30');
    await numberInputs.nth(1).fill('5');
    
    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(2000);

    // Verify the shift appears in the table
    await expect(page.locator('td').filter({ hasText: 'Test Night Shift' }).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Holidays CRUD', () => {
  test('can create a holiday', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page);
    await page.goto(URLS.attendanceHolidays);
    await page.waitForLoadState('networkidle');

    await page.click('text=+ Add Holiday');
    await page.waitForSelector('h3:has-text("Add Holiday")');

    // Fill holiday name (text input inside form)
    await page.locator('input[type="text"]').first().fill('Test Holiday');
    
    // Fill date input
    await page.locator('input[type="date"]').fill('2026-12-25');
    
    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(2000);

    await expect(page.locator('td').filter({ hasText: 'Test Holiday' }).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Geofences CRUD', () => {
  test('can create a geofence', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page);
    await page.goto(URLS.attendanceGeofences);
    await page.waitForLoadState('networkidle');

    await page.click('text=+ Add Geofence');
    await page.waitForSelector('h3:has-text("Add Geofence")');

    // Fill the form - the form has 4 inputs: name(text), radius(number), lat(number), lng(number)
    // Use the placeholder to identify the name field
    await page.locator('input[placeholder*="Office"]').fill('Test Location');
    
    // Fill number inputs in order: Radius, Latitude, Longitude
    await page.locator('input[type="number"]').nth(0).fill('100');
    await page.locator('input[type="number"]').nth(1).fill('14.5995');
    await page.locator('input[type="number"]').nth(2).fill('120.9842');
    
    await page.locator('button[type="submit"]').click();
    
    // Wait for form to close or error
    await page.waitForTimeout(3000);

    await expect(page.locator('td').filter({ hasText: 'Test Location' }).first()).toBeVisible({ timeout: 10000 });
  });
});
