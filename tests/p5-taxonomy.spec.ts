import { test, expect } from '@playwright/test';
import { PORTS } from './helpers/test-constants';
import { waitForMapLoad, getSceneState, getPrototypeState } from './helpers/test-api-helper';
import { captureCheckpoint } from './helpers/screenshot-helper';

const BASE_URL = `http://localhost:${PORTS.p5}`;

test.describe('P5 — Urban Taxonomy (San Francisco)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('map loads successfully', async ({ page }) => {
    await waitForMapLoad(page);
    const state = await getSceneState(page);
    expect(state.mapLoaded).toBe(true);
    await captureCheckpoint(page, 'p5', '01-map-loaded');
  });

  test('taxonomy data auto-loads', async ({ page }) => {
    // P5 auto-loads pre-extracted SF data — no extraction needed
    // Wait for loading to complete (large GeoJSON, may take 15-30s)
    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getClassificationState?: () => { cellCount: number; isLoading: boolean; error: string | null } }
          | undefined;
        const state = api?.getClassificationState?.();
        return state && !state.isLoading && state.cellCount > 0;
      },
      { timeout: 60_000 },
    );

    const classState = await getPrototypeState(page, 'getClassificationState');
    expect(classState).not.toBeNull();
    expect(classState!.cellCount).toBeGreaterThan(1000);
    expect(classState!.isLoading).toBe(false);
    expect(classState!.error).toBeNull();

    console.log(`[P5-TEST] Cell count: ${classState!.cellCount}`);
    console.log(`[P5-TEST] Load time: ${classState!.loadTimeMs}ms`);

    await captureCheckpoint(page, 'p5', '02-data-loaded');
  });

  test('spacematrix classification is active by default', async ({ page }) => {
    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getClassificationState?: () => { cellCount: number; isLoading: boolean } }
          | undefined;
        const state = api?.getClassificationState?.();
        return state && !state.isLoading && state.cellCount > 0;
      },
      { timeout: 60_000 },
    );

    const classState = await getPrototypeState(page, 'getClassificationState');
    expect(classState!.activeClassification).toBeDefined();
    console.log(`[P5-TEST] Active classification: ${classState!.activeClassification}`);

    await captureCheckpoint(page, 'p5', '03-spacematrix-active');
  });

  test('classification toggle switches views', async ({ page }) => {
    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getClassificationState?: () => { cellCount: number; isLoading: boolean } }
          | undefined;
        const state = api?.getClassificationState?.();
        return state && !state.isLoading && state.cellCount > 0;
      },
      { timeout: 60_000 },
    );

    // Try clicking LCZ button
    const lczButton = page.locator('button:has-text("LCZ")');
    if (await lczButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await lczButton.click();
      await page.waitForTimeout(1000);

      const state = await getPrototypeState(page, 'getClassificationState');
      console.log(`[P5-TEST] After LCZ toggle: ${state?.activeClassification}`);
      await captureCheckpoint(page, 'p5', '04-lcz-toggled');
    } else {
      console.log('[P5-TEST] LCZ button not found — skipping toggle test');
    }

    // Try clicking Cluster button
    const clusterButton = page.locator('button:has-text("Cluster")');
    if (await clusterButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clusterButton.click();
      await page.waitForTimeout(1000);

      const state = await getPrototypeState(page, 'getClassificationState');
      console.log(`[P5-TEST] After Cluster toggle: ${state?.activeClassification}`);
      await captureCheckpoint(page, 'p5', '05-cluster-toggled');
    }
  });

  test('load time is acceptable', async ({ page }) => {
    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getClassificationState?: () => { cellCount: number; isLoading: boolean; loadTimeMs: number } }
          | undefined;
        const state = api?.getClassificationState?.();
        return state && !state.isLoading && state.cellCount > 0;
      },
      { timeout: 60_000 },
    );

    const classState = await getPrototypeState(page, 'getClassificationState');
    const loadTime = classState!.loadTimeMs as number;
    console.log(`[P5-TEST] Load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(60_000); // 60s max for 156K cells
  });
});
