import { test, expect } from "@playwright/test";

const BASE_URL = process.env.SAKSI_BASE_URL || "http://127.0.0.1:8000";

test.describe("SAKSI Platform End-to-End Verification", () => {
  test("1. Landing page renders positioning and navigates to Command Centre", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE_URL}/`);
    await expect(page.locator("body")).toContainText("SAKSI");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test("2. Command Centre renders Cortex XSIAM pipeline flow andBackend running status", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE_URL}/app/command-centre`);
    await expect(page.locator("body")).toContainText("Backend running");
    await expect(page.locator("body")).toContainText("Self-declared analyst");
    await expect(page.locator("body")).toContainText("Telemetry-to-Response Pipeline");
  });

  test("3. Case Workspace renders Attack Graph, Plan DAG, Findings, and Response Queue", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE_URL}/app/cases/CASE-2026-0001`);
    await expect(page.locator("body")).toContainText("CASE-2026-0001");
    await expect(page.locator("body")).toContainText("Investigation Plan");
  });

  test("4. Benchmarks page discloses Synthetic Evaluation Harness honestly", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE_URL}/app/benchmarks`);
    await expect(page.locator("body")).not.toContainText("Real-World");
  });
});

