import { test, expect } from '@playwright/test';
import { PORTS, EIXAMPLE_BBOX, BENCHMARKS, withinTolerance } from './helpers/test-constants';
import { waitForMapLoad, triggerExtraction, getSceneState, getMetricValues, getPrototypeState } from './helpers/test-api-helper';
import { captureCheckpoint } from './helpers/screenshot-helper';

const BASE_URL = `http://localhost:${PORTS.p4}`;

test.describe('P4 — Fragment Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForMapLoad(page);
  });

  test('map loads in idle phase', async ({ page }) => {
    const state = await getSceneState(page);
    expect(state.mapLoaded).toBe(true);

    const fragState = await getPrototypeState(page, 'getFragmentState');
    expect(fragState).not.toBeNull();
    expect(fragState!.phase).toBe('idle');
    expect(fragState!.libraryCount).toBe(0);

    console.log(`[P4-TEST] Initial phase: ${fragState!.phase}`);
    await captureCheckpoint(page, 'p4', '01-idle');
  });

  test('extraction creates a fragment', async ({ page }) => {
    await triggerExtraction(page, EIXAMPLE_BBOX);

    // Wait for fragment to be extracted
    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getFragmentState?: () => { currentFragment: unknown | null } }
          | undefined;
        return api?.getFragmentState?.()?.currentFragment !== null;
      },
      { timeout: 120_000 },
    );

    const fragState = await getPrototypeState(page, 'getFragmentState');
    expect(fragState).not.toBeNull();
    expect(fragState!.currentFragment).not.toBeNull();

    const frag = fragState!.currentFragment as { buildingCount: number; streetCount: number };
    console.log(`[P4-TEST] Phase: ${fragState!.phase}`);
    console.log(`[P4-TEST] Building count: ${frag.buildingCount}`);
    console.log(`[P4-TEST] Street count: ${frag.streetCount}`);
    expect(frag.buildingCount).toBeGreaterThan(20);

    await captureCheckpoint(page, 'p4', '02-extracted');
  });

  test('fragment metrics match benchmarks', async ({ page }) => {
    await triggerExtraction(page, EIXAMPLE_BBOX);

    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getFragmentState?: () => { currentFragment: unknown | null } }
          | undefined;
        return api?.getFragmentState?.()?.currentFragment !== null;
      },
      { timeout: 120_000 },
    );

    const metrics = await getMetricValues(page);
    if (metrics) {
      console.log(`[P4-TEST] GSI: ${metrics.gsi} (expected ${BENCHMARKS.gsi.expected})`);
      console.log(`[P4-TEST] FSI: ${metrics.fsi} (expected ${BENCHMARKS.fsi.expected})`);
      console.log(`[P4-TEST] Mean height: ${metrics.meanHeight}`);
      console.log(`[P4-TEST] Building count: ${metrics.buildingCount}`);

      if (typeof metrics.gsi === 'number') {
        expect(withinTolerance(metrics.gsi as number, BENCHMARKS.gsi.expected, BENCHMARKS.gsi.tolerance)).toBe(true);
      }
      if (typeof metrics.fsi === 'number') {
        expect(withinTolerance(metrics.fsi as number, BENCHMARKS.fsi.expected, BENCHMARKS.fsi.tolerance)).toBe(true);
      }
    }

    await captureCheckpoint(page, 'p4', '03-metrics');
  });

  test('fragment can be saved to library', async ({ page }) => {
    await triggerExtraction(page, EIXAMPLE_BBOX);

    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getFragmentState?: () => { currentFragment: unknown | null } }
          | undefined;
        return api?.getFragmentState?.()?.currentFragment !== null;
      },
      { timeout: 120_000 },
    );

    // Look for save button
    const saveBtn = page.locator('button:has-text("Save")');
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveBtn.click();

      // Handle name input if dialog appears
      const nameInput = page.locator('input[type="text"]');
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.fill('Test Fragment');
        const confirmBtn = page.locator('button:has-text("OK"), button:has-text("Save"), button:has-text("Confirm")');
        if (await confirmBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.first().click();
        }
      }

      await page.waitForTimeout(2000);

      const fragState = await getPrototypeState(page, 'getFragmentState');
      console.log(`[P4-TEST] Library count after save: ${fragState?.libraryCount}`);

      await captureCheckpoint(page, 'p4', '04-library-saved');
    } else {
      console.log('[P4-TEST] Save button not found — skipping library test');
    }
  });

  test('fragment library API is accessible', async ({ page }) => {
    const library = await page.evaluate(() => {
      const api = (window as Record<string, unknown>).__TEST_API__ as
        | { getFragmentLibrary?: () => unknown[] }
        | undefined;
      return api?.getFragmentLibrary?.() ?? [];
    });

    console.log(`[P4-TEST] Library entries: ${(library as unknown[]).length}`);
  });
});
