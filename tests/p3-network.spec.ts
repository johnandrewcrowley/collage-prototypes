import { test, expect } from '@playwright/test';
import { PORTS, EIXAMPLE_BBOX } from './helpers/test-constants';
import { waitForMapLoad, triggerExtraction, getSceneState, getMetricValues, getPrototypeState } from './helpers/test-api-helper';
import { captureCheckpoint } from './helpers/screenshot-helper';

const BASE_URL = `http://localhost:${PORTS.p3}`;

test.describe('P3 — Network & Space Syntax Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForMapLoad(page);
  });

  test('map loads in flat view', async ({ page }) => {
    const state = await getSceneState(page);
    expect(state.mapLoaded).toBe(true);
    await captureCheckpoint(page, 'p3', '01-map-loaded');
  });

  test('network extraction and analysis completes', async ({ page }) => {
    await triggerExtraction(page, EIXAMPLE_BBOX);

    // Wait for network analysis to complete
    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getNetworkState?: () => { streetCount: number; phase: string } }
          | undefined;
        const state = api?.getNetworkState?.();
        return state && state.streetCount > 0;
      },
      { timeout: 120_000 },
    );

    const networkState = await getPrototypeState(page, 'getNetworkState');
    expect(networkState).not.toBeNull();
    expect(networkState!.streetCount).toBeGreaterThan(50);
    expect(networkState!.centralityNodes).toBeGreaterThan(0);

    console.log(`[P3-TEST] Phase: ${networkState!.phase}`);
    console.log(`[P3-TEST] Street count: ${networkState!.streetCount}`);
    console.log(`[P3-TEST] Centrality nodes: ${networkState!.centralityNodes}`);
    console.log(`[P3-TEST] Active metric: ${networkState!.activeMetric}`);
    console.log(`[P3-TEST] Active radius: ${networkState!.activeRadius}`);

    await captureCheckpoint(page, 'p3', '02-network-loaded');
  });

  test('NAIN/NACH metric values are valid', async ({ page }) => {
    await triggerExtraction(page, EIXAMPLE_BBOX);

    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getNetworkState?: () => { streetCount: number } }
          | undefined;
        return (api?.getNetworkState?.()?.streetCount ?? 0) > 0;
      },
      { timeout: 120_000 },
    );

    const metricValues = await getMetricValues(page);
    if (metricValues) {
      console.log(`[P3-TEST] Metric: ${metricValues.metric}`);
      console.log(`[P3-TEST] Count: ${metricValues.count}`);
      console.log(`[P3-TEST] Min: ${metricValues.min}`);
      console.log(`[P3-TEST] Max: ${metricValues.max}`);
      console.log(`[P3-TEST] Mean: ${metricValues.mean}`);

      expect(metricValues.count).toBeGreaterThan(0);
      if (typeof metricValues.min === 'number' && typeof metricValues.max === 'number') {
        expect(metricValues.min).toBeGreaterThanOrEqual(0);
        expect(metricValues.max).toBeLessThanOrEqual(2.0);
      }
    }

    await captureCheckpoint(page, 'p3', '03-metric-values');
  });

  test('network stats are populated', async ({ page }) => {
    await triggerExtraction(page, EIXAMPLE_BBOX);

    await page.waitForFunction(
      () => {
        const api = (window as Record<string, unknown>).__TEST_API__ as
          | { getNetworkState?: () => { streetCount: number } }
          | undefined;
        return (api?.getNetworkState?.()?.streetCount ?? 0) > 0;
      },
      { timeout: 120_000 },
    );

    const networkState = await getPrototypeState(page, 'getNetworkState');
    const stats = networkState?.networkStats as Record<string, number> | undefined;
    const aggregates = networkState?.aggregates as Record<string, unknown> | undefined;

    if (stats) {
      console.log(`[P3-TEST] Network stats:`, JSON.stringify(stats));
    }
    if (aggregates) {
      console.log(`[P3-TEST] Aggregates:`, JSON.stringify(aggregates));
    }

    await captureCheckpoint(page, 'p3', '04-network-stats');
  });
});
