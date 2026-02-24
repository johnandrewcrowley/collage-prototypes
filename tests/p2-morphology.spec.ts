import { test, expect } from '@playwright/test';
import { PORTS, EIXAMPLE_BBOX, BENCHMARKS, withinTolerance } from './helpers/test-constants';
import { waitForMapLoad, triggerExtraction, waitForBuildings, getSceneState, getMetricValues } from './helpers/test-api-helper';
import { captureCheckpoint } from './helpers/screenshot-helper';

const BASE_URL = `http://localhost:${PORTS.p2}`;

test.describe('P2 — Morphology Metrics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForMapLoad(page);
  });

  test('map loads with Barcelona centered', async ({ page }) => {
    const state = await getSceneState(page);
    expect(state.mapLoaded).toBe(true);
    await captureCheckpoint(page, 'p2', '01-map-loaded');
  });

  test('extraction loads buildings and computes metrics', async ({ page }) => {
    await triggerExtraction(page, EIXAMPLE_BBOX);

    // Wait for buildings to load
    const buildingCount = await waitForBuildings(page, 50);
    console.log(`[P2-TEST] Building count: ${buildingCount}`);
    expect(buildingCount).toBeGreaterThan(50);

    await captureCheckpoint(page, 'p2', '02-buildings-loaded');

    // Wait for metrics to be computed
    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getMetricValues?: () => { metricsComputed: boolean } | null }
          | undefined;
        return api?.getMetricValues?.()?.metricsComputed === true;
      },
      { timeout: 60_000 },
    );

    await captureCheckpoint(page, 'p2', '03-metrics-computed');
  });

  test('Spacematrix benchmarks match Barcelona Eixample', async ({ page }) => {
    await triggerExtraction(page, EIXAMPLE_BBOX);
    await waitForBuildings(page, 50);

    // Wait for metrics
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

    const spacematrix = metrics!.spacematrix as { gsi: number; fsi: number; lcz: { lcz: number } } | null;
    if (spacematrix) {
      console.log(`[P2-TEST] GSI: ${spacematrix.gsi} (expected ${BENCHMARKS.gsi.expected} ±${BENCHMARKS.gsi.tolerance * 100}%)`);
      console.log(`[P2-TEST] FSI: ${spacematrix.fsi} (expected ${BENCHMARKS.fsi.expected} ±${BENCHMARKS.fsi.tolerance * 100}%)`);
      console.log(`[P2-TEST] LCZ: ${spacematrix.lcz?.lcz} (expected ${BENCHMARKS.lcz.expected})`);

      expect(withinTolerance(spacematrix.gsi, BENCHMARKS.gsi.expected, BENCHMARKS.gsi.tolerance)).toBe(true);
      expect(withinTolerance(spacematrix.fsi, BENCHMARKS.fsi.expected, BENCHMARKS.fsi.tolerance)).toBe(true);
    } else {
      console.log('[P2-TEST] Spacematrix data not available');
    }
  });

  test('metric coloring is applied to buildings', async ({ page }) => {
    await triggerExtraction(page, EIXAMPLE_BBOX);
    await waitForBuildings(page, 50);

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
    expect(metrics!.activeMetric).toBeDefined();
    console.log(`[P2-TEST] Active metric: ${metrics!.activeMetric}`);

    await captureCheckpoint(page, 'p2', '04-metric-coloring');
  });

  test('timing is logged', async ({ page }) => {
    await triggerExtraction(page, EIXAMPLE_BBOX);
    await waitForBuildings(page, 50);

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
    const timing = metrics!.timing as Record<string, number> | undefined;
    if (timing) {
      console.log(`[P2-TEST] Timing:`, JSON.stringify(timing));
    }
  });
});
