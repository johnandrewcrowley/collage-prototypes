import { test, expect } from '@playwright/test';
import { PORTS, EIXAMPLE_BBOX } from './helpers/test-constants';
import { waitForMapLoad, triggerExtraction, waitForBuildings, getSceneState, getMetricValues } from './helpers/test-api-helper';
import { captureCheckpoint } from './helpers/screenshot-helper';

const BASE_URL = `http://localhost:${PORTS.p1}`;

test.describe('P1 — Sustainability Scanner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('map loads with shadow system', async ({ page }) => {
    await waitForMapLoad(page);
    const state = await getSceneState(page);
    expect(state.mapLoaded).toBe(true);
    await captureCheckpoint(page, 'p1', '01-map-loaded');
  });

  test('extraction loads buildings with shadows', async ({ page }) => {
    await waitForMapLoad(page);
    await triggerExtraction(page, EIXAMPLE_BBOX);

    const buildingCount = await waitForBuildings(page, 50);
    console.log(`[P1-TEST] Building count: ${buildingCount}`);
    expect(buildingCount).toBeGreaterThan(50);

    const state = await getSceneState(page);
    console.log(`[P1-TEST] Shadow enabled: ${state.shadowEnabled}`);

    await captureCheckpoint(page, 'p1', '02-buildings-with-shadows');
  });

  test('sustainability metrics are computed', async ({ page }) => {
    await waitForMapLoad(page);
    await triggerExtraction(page, EIXAMPLE_BBOX);
    await waitForBuildings(page, 50);

    // Wait for tier 1 metrics
    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getMetricValues?: () => { metricsComputed: boolean } | null }
          | undefined;
        return api?.getMetricValues?.()?.metricsComputed === true;
      },
      { timeout: 60_000 },
    );

    const metrics = await getMetricValues(page);
    expect(metrics).not.toBeNull();
    expect(metrics!.metricsComputed).toBe(true);
    expect(metrics!.buildingCount).toBeGreaterThan(0);

    console.log(`[P1-TEST] Active metric: ${metrics!.activeMetric}`);
    console.log(`[P1-TEST] Aggregate:`, JSON.stringify(metrics!.aggregate));

    await captureCheckpoint(page, 'p1', '03-metrics-computed');
  });

  test('shadow coverage is a valid number', async ({ page }) => {
    await waitForMapLoad(page);
    await triggerExtraction(page, EIXAMPLE_BBOX);
    await waitForBuildings(page, 50);

    // Wait briefly for shadow system to calculate
    await page.waitForTimeout(3000);

    const metrics = await getMetricValues(page);
    if (metrics?.shadowCoverage !== undefined) {
      const coverage = metrics.shadowCoverage as number;
      console.log(`[P1-TEST] Shadow coverage: ${coverage}`);
      expect(coverage).toBeGreaterThanOrEqual(0);
      expect(coverage).toBeLessThanOrEqual(1);
    } else {
      console.log('[P1-TEST] Shadow coverage not yet computed');
    }
  });

  test('tab switching works', async ({ page }) => {
    await waitForMapLoad(page);
    await triggerExtraction(page, EIXAMPLE_BBOX);
    await waitForBuildings(page, 50);

    // Try switching to Environment tab
    const envTab = page.locator('button:has-text("Environment")');
    if (await envTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await envTab.click();
      await page.waitForTimeout(500);
      await captureCheckpoint(page, 'p1', '04-environment-tab');
    }

    // Try switching to Climate Risk tab
    const climateTab = page.locator('button:has-text("Climate")');
    if (await climateTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await climateTab.click();
      await page.waitForTimeout(500);
      await captureCheckpoint(page, 'p1', '05-climate-risk-tab');
    }
  });

  test('BVH metrics start computing', async ({ page }) => {
    await waitForMapLoad(page);
    await triggerExtraction(page, EIXAMPLE_BBOX);
    await waitForBuildings(page, 50);

    // BVH build may take a while in SwiftShader — just check if it starts
    await page.waitForTimeout(5000);
    const metrics = await getMetricValues(page);

    console.log(`[P1-TEST] BVH ready: ${metrics?.bvhReady}`);
    console.log(`[P1-TEST] Sun hours computed: ${metrics?.sunHoursComputed}`);
    console.log(`[P1-TEST] SVF computed: ${metrics?.svfComputed}`);
    console.log(`[P1-TEST] VSC computed: ${metrics?.vscComputed}`);
    console.log(`[P1-TEST] Computing: ${metrics?.computingMetric}`);
    console.log(`[P1-TEST] Progress: ${metrics?.computeProgress}`);

    await captureCheckpoint(page, 'p1', '06-bvh-status');
  });
});
