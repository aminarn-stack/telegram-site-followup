import { expect, test } from '@playwright/test';

const pendingByOwner = {
  MTNI: { since: '2026-11-03T12:00:00.000Z', minutes: 1500, estimated: true },
  Contractor: null,
};

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
          serviceCenters: ['SC-A'],
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
            steps: [{ templateStep: { label: 'Sharing result' } }],
          },
        ],
        sitesByStatus: {
          NOT_STARTED: [
            {
              publicId: '22222222-2222-4222-8222-222222222222',
              siteIdText: '001001',
              region: 'North',
              serviceCenter: 'SC-A',
              pendingByOwner,
              actionableSteps: ['Initial access assessment'],
            },
          ],
          IN_PROGRESS: [
            {
              publicId: '33333333-3333-4333-8333-333333333333',
              siteIdText: '001002',
              region: 'North',
              serviceCenter: 'SC-A',
              pendingByOwner,
              actionableSteps: ['Pre-TSS'],
            },
          ],
          BLOCKED: [
            {
              publicId: '11111111-1111-4111-8111-111111111111',
              siteIdText: '001004',
              region: 'South',
              serviceCenter: 'SC-B',
              pendingByOwner,
              actionableSteps: [],
            },
          ],
          COMPLETED: [
            {
              publicId: '44444444-4444-4444-8444-444444444444',
              siteIdText: '001003',
              region: 'South',
              serviceCenter: 'SC-B',
              pendingByOwner,
              actionableSteps: [],
            },
          ],
        },
        scopeBreakdown: [
          { serviceCenter: 'SC-A', regions: ['North'], total: 2, completed: 0, blocked: 0 },
          { serviceCenter: 'SC-B', regions: ['South'], total: 2, completed: 1, blocked: 1 },
        ],
      },
    }),
  );
  await page.route('**/api/admin/users', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/chats', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/templates', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/service-centers', (route) =>
    route.fulfill({
      json: [
        { id: 'sc-a', code: 'SC-A' },
        { id: 'sc-b', code: 'SC-B' },
      ],
    }),
  );
});

test('uses imported SC choices without manual Region or SC creation forms', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByLabel('Region code')).toHaveCount(0);
  await expect(page.getByLabel('SC code')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'SC-A' })).toHaveCount(2);
  await expect(
    page.getByText('SCs and regions are created automatically from committed imports.').first(),
  ).toBeVisible();
});

test('shows the Telegram mobile dashboard with status counts and site IDs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Weekly overview' })).toBeVisible();
  await expect(page.getByText('4', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('001004')).toBeVisible();
  await expect(
    page.getByRole('link', { name: /001004/ }).getByText('MTNI pending: at least 1d 1h'),
  ).toBeVisible();
  await expect(page.getByText('SC-A', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Current and next steps export' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
});

test('keeps site ID search and links to each site across pages', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/sites',
    (route) => {
      const params = new URL(route.request().url()).searchParams;
      const pageNumber = Number(params.get('page') ?? 1);
      const search = params.get('search');
      const siteId = pageNumber === 2 || search ? '001026' : '001001';
      return route.fulfill({
        json: {
          items: [
            {
              id: siteId,
              status: 'NOT_STARTED',
              site: {
                publicId: siteId,
                siteIdText: siteId,
                serviceCenter: { code: 'SC-A' },
                region: { code: 'North' },
                siteType: 'NORMAL',
                sectorAddition: 'NO',
              },
              progress: { completed: 0, total: 5 },
              pendingByOwner,
            },
          ],
          total: search ? 1 : 26,
          page: pageNumber,
          pageSize: 25,
        },
      });
    },
  );
  await page.route('**/api/sites/001026', (route) =>
    route.fulfill({
      json: {
        siteIdText: '001026',
        siteType: 'NORMAL',
        sectorAddition: 'NO',
        serviceCenter: { code: 'SC-A' },
        region: { code: 'North' },
        workflow: {
          status: 'IN_PROGRESS',
          pendingByOwner,
          steps: [
            {
              id: 'step-1',
              state: 'ACTIONABLE',
              owner: 'MTNI',
              pendingAge: pendingByOwner.MTNI,
              templateStep: { code: 'INSTALLATION_PLAN', label: 'Installation plan by RND' },
              evidence: [],
            },
          ],
        },
        audit: [],
      },
    }),
  );
  await page.goto('/sites');
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /001001/ })).toHaveAttribute('href', '/sites/001001');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(page.getByRole('link', { name: /001026/ })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search site ID' }).fill('001026');
  await expect(page).toHaveURL(/\/sites\?search=001026$/);
  const site = page.getByRole('link', { name: /001026/ });
  await expect(site).toHaveAttribute('href', '/sites/001026');
  await expect(site.getByText('MTNI pending: at least 1d 1h')).toBeVisible();
  await expect(site.getByText('Contractor pending: None')).toBeVisible();
  await site.click();
  await expect(page.getByText('Owner: MTNI · Pending for at least 1d 1h')).toBeVisible();
});
