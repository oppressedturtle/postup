/**
 * PostUp — Golden-path E2E test suite
 *
 * These tests run against a locally seeded database (npm run db:seed).
 * They are skipped in CI where no live database is available.
 *
 * To run locally:
 *   npm run db:seed      # seed the database with test data
 *   npm run e2e          # run Playwright tests
 *   npm run e2e:ui       # run with interactive UI
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard — skip entire suite in CI (no seeded DB available)
// ---------------------------------------------------------------------------

const E2E_ENABLED = !process.env.CI

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(
  page: Page,
  email = 'overseer@postup.dev',
  password = 'password123',
) {
  await page.goto('/login')
  await page.fill('[name="email"]', email)
  await page.fill('[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/')
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('PostUp golden path', () => {
  test.skip(!E2E_ENABLED, 'E2E tests require a running database — skipped in CI')

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  test('home page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/PostUp/i)
    // Feed or landing hero is visible
    await expect(page.locator('main')).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  test('user can register', async ({ page }) => {
    await page.goto('/register')
    await page.fill('[name="email"]', `e2etest_${Date.now()}@postup.dev`)
    await page.fill('[name="handle"]', `e2euser${Date.now()}`.slice(0, 20))
    await page.fill('[name="password"]', 'password123')
    await page.fill('[name="confirmPassword"]', 'password123')
    await page.click('button[type="submit"]')
    // Should redirect to home after registration
    await page.waitForURL('/')
    // Header should reflect logged-in state
    await expect(page.locator('header')).toContainText(/u\//i)
  })

  test('user can log in', async ({ page }) => {
    await login(page, 'testuser@postup.dev', 'password123')
    await expect(page.locator('header')).toContainText('testuser')
  })

  // -------------------------------------------------------------------------
  // Hubs
  // -------------------------------------------------------------------------

  test('user can create a hub', async ({ page }) => {
    await login(page)
    await page.goto('/h/create')
    await page.fill('[name="name"]', 'E2E Test Hub')
    await page.fill('[name="slug"]', 'e2etesthub')
    await page.fill('[name="description"]', 'Hub created by automated E2E tests')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/h\/e2etesthub/)
    await expect(page.locator('h1, h2').first()).toContainText(/e2e test hub/i)
  })

  // -------------------------------------------------------------------------
  // Drops
  // -------------------------------------------------------------------------

  test('user can post a text drop', async ({ page }) => {
    await login(page)
    await page.goto('/h/e2etesthub/submit')
    // Select Text type if a type selector exists
    const textOption = page.locator('[data-type="TEXT"], input[value="TEXT"]')
    if (await textOption.count()) await textOption.first().click()
    await page.fill('[name="title"]', 'E2E Test Drop Title')
    const bodyField = page.locator('textarea[name="body"], [aria-label*="body" i]').first()
    if (await bodyField.count()) await bodyField.fill('This is the body of the E2E test drop.')
    await page.click('button[type="submit"]')
    // Should redirect to the drop detail page
    await page.waitForURL(/\/drops\//)
    await expect(page.locator('h1, h2').first()).toContainText(/E2E Test Drop Title/)
  })

  test('user can boost a drop', async ({ page }) => {
    await login(page)
    // Navigate to a known seeded drop
    await page.goto('/')
    const firstDrop = page.locator('article').first()
    await firstDrop.waitFor({ state: 'visible' })

    // Read current heat score
    const heatEl = firstDrop.locator('[aria-label$="heat"]').first()
    const initialHeatText = await heatEl.textContent()
    const initialHeat = parseInt(initialHeatText ?? '0', 10)

    // Click Boost
    await firstDrop.locator('button[aria-label*="Boost"]').first().click()

    // Optimistic update: heat increments by 1
    await expect(heatEl).toHaveText(String(initialHeat + 1))
  })

  test('user can reply to a drop', async ({ page }) => {
    await login(page)
    await page.goto('/')
    const firstDrop = page.locator('article').first()
    await firstDrop.waitFor({ state: 'visible' })
    // Navigate to drop detail
    await firstDrop.locator('a[href*="/drops/"]').first().click()
    await page.waitForURL(/\/drops\//)

    // Find and fill the reply textarea
    const replyTextarea = page.locator('textarea[aria-label*="reply" i], textarea[placeholder*="reply" i]').first()
    await replyTextarea.fill('This is an automated E2E test reply.')
    await page.click('button[type="submit"]:has-text("Reply")')

    // Reply appears in thread
    await expect(page.locator('text=This is an automated E2E test reply.')).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Stash
  // -------------------------------------------------------------------------

  test('user can stash and unstash a drop', async ({ page }) => {
    await login(page)
    await page.goto('/')
    const firstDrop = page.locator('article').first()
    await firstDrop.waitFor({ state: 'visible' })

    // Stash the drop
    const stashBtn = firstDrop.locator('button[aria-label="Save to Stash"]')
    await stashBtn.click()
    await expect(firstDrop.locator('button[aria-label="Remove from Stash"]')).toBeVisible()

    // Navigate to stash page
    await page.goto('/stash')
    await expect(page.locator('article')).toHaveCount({ minimum: 1 } as any)

    // Unstash
    const stashedDrop = page.locator('article').first()
    await stashedDrop.locator('button[aria-label="Remove from Stash"]').click()
    // Drop removed from stash view
    await expect(stashedDrop).not.toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Moderation
  // -------------------------------------------------------------------------

  test('warden can pin a drop', async ({ page }) => {
    // Login as the seeded OVERSEER who has Warden access to all hubs
    await login(page, 'overseer@postup.dev', 'password123')
    await page.goto('/')
    const firstDrop = page.locator('article').first()
    await firstDrop.waitFor({ state: 'visible' })

    // Open mod menu
    const modMenuBtn = firstDrop.locator('button[aria-label*="mod" i], button[aria-label*="moderate" i]').first()
    await modMenuBtn.click()

    // Click Pin
    await page.locator('button:has-text("Pin"), [role="menuitem"]:has-text("Pin")').first().click()

    // Drop shows pinned indicator
    await expect(firstDrop.locator('text=Pinned')).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  test('search finds hubs and drops', async ({ page }) => {
    await page.goto('/')

    // Activate search
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first()
    await searchInput.fill('gaming')

    // Dropdown shows at least one result
    await expect(
      page.locator('[role="listbox"], [role="option"], [data-testid="search-result"]').first(),
    ).toBeVisible({ timeout: 3000 })

    // Click first result → navigates to hub
    await page.locator('[role="option"], [data-testid="search-result"]').first().click()
    await expect(page).toHaveURL(/\/h\//)
  })
})
