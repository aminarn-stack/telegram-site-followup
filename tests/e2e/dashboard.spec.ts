import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/dev', (route) =>
    route.fulfill({
      json: {
        token: 'test-token',
        user: {
          id: 'u1',
          telegramUserId: '100000001',
          firstName: 'Test Admin',
          role: 'ADMIN',
          regions: ['North'],
        },
      },
    }),
  );
  await page.route('**/api/dashboard', (route) =>
    route.fulfill({
      json: {
        total: 4,
        counts: { NOT_STARTED: 1, IN_PROGRESS: 1, BLOCKED: 1, COMPLETED: 1 },
        latestBatch: { reportingWeek: '2026-10-27T00:00:00.000Z', acceptedRows: 4 },
        blocked: [
          {
            site: {
              publicId: '11111111-1111-4111-8111-111111111111',
              siteIdText: '001004',
              region: { code: 'South' },
            },
            steps: [{ templateStep: { label: 'Sharing Result' } }],
          },
        ],
        sitesByStatus: {
          NOT_STARTED: [
            {
              publicId: '22222222-2222-4222-8222-222222222222',
              siteIdText: '001001',
              region: 'North',
              actionableSteps: ['Initial access assessment'],
            },
          ],
          IN_PROGRESS: [
            {
              publicId: '33333333-3333-4333-8333-333333333333',
              siteIdText: '001002',
              region: 'North',
              actionableSteps: ['Pre-TSS'],
            },
          ],
          BLOCKED: [
            {
              publicId: '11111111-1111-4111-8111-111111111111',
              siteIdText: '001004',
              region: 'South',
              actionableSteps: [],
            },
          ],
          COMPLETED: [
            {
              publicId: '44444444-4444-4444-8444-444444444444',
              siteIdText: '001003',
              region: 'South',
              actionableSteps: [],
            },
          ],
        },
      },
    }),
  );
});

test('shows the Telegram mobile dashboard with status counts and site IDs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Weekly overview' })).toBeVisible();
  await expect(page.getByText('4', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('001004')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
});
