import type { Page } from '@playwright/test';
import * as path from 'path';
import { SCREENSHOT_DIR } from './test-constants';

/**
 * Capture a named screenshot checkpoint.
 * Screenshots are saved to test-results/screenshots/{proto}/{name}.png
 */
export async function captureCheckpoint(
  page: Page,
  proto: string,
  name: string,
): Promise<string> {
  const filepath = path.join(SCREENSHOT_DIR, proto, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  return filepath;
}
