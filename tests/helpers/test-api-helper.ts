import type { Page } from '@playwright/test';
import { BACKEND_URL } from './test-constants';

/** Wait for the map to be fully loaded (mapLoaded === true in __TEST_API__) */
export async function waitForMapLoad(page: Page, timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const api = (window as Record<string, unknown>).__TEST_API__ as
        | { getSceneState?: () => { mapLoaded: boolean } }
        | undefined;
      return api?.getSceneState?.()?.mapLoaded === true;
    },
    { timeout: timeoutMs },
  );
}

/** Trigger extraction programmatically via __TEST_API__ and wait for buildings */
export async function triggerExtraction(
  page: Page,
  bbox: readonly [number, number, number, number],
  timeoutMs = 120_000,
): Promise<void> {
  await page.evaluate(
    async ([b, url]) => {
      const api = (window as Record<string, unknown>).__TEST_API__ as
        | { triggerExtraction?: (bbox: number[], url: string) => Promise<void> }
        | undefined;
      if (!api?.triggerExtraction) throw new Error('__TEST_API__.triggerExtraction not found');
      await api.triggerExtraction(b as number[], url as string);
    },
    [[...bbox], BACKEND_URL] as const,
  );
}

/** Wait until building count reaches minimum threshold */
export async function waitForBuildings(
  page: Page,
  minCount = 1,
  timeoutMs = 120_000,
): Promise<number> {
  const result = await page.waitForFunction(
    (min: number) => {
      const api = (window as Record<string, unknown>).__TEST_API__ as
        | { getSceneState?: () => { buildingCount: number } }
        | undefined;
      const count = api?.getSceneState?.()?.buildingCount ?? 0;
      return count >= min ? count : false;
    },
    minCount,
    { timeout: timeoutMs },
  );
  return result.jsonValue() as Promise<number>;
}

/** Get the scene state from __TEST_API__ */
export async function getSceneState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const api = (window as Record<string, unknown>).__TEST_API__ as
      | { getSceneState?: () => Record<string, unknown> }
      | undefined;
    return api?.getSceneState?.() ?? {};
  });
}

/** Get prototype-specific metric values from __TEST_API__ */
export async function getMetricValues(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const api = (window as Record<string, unknown>).__TEST_API__ as
      | { getMetricValues?: () => Record<string, unknown> | null }
      | undefined;
    return api?.getMetricValues?.() ?? null;
  });
}

/** Get prototype-specific state (P3 network, P4 fragment, P5 classification) */
export async function getPrototypeState(
  page: Page,
  methodName: string,
): Promise<Record<string, unknown> | null> {
  return page.evaluate((method: string) => {
    const api = (window as Record<string, unknown>).__TEST_API__ as Record<string, unknown> | undefined;
    const fn = api?.[method] as (() => Record<string, unknown>) | undefined;
    return fn?.() ?? null;
  }, methodName);
}
