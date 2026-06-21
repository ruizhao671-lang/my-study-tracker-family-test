import assert from "node:assert/strict";

const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const browserExecutable = process.env.BROWSER_EXECUTABLE;
const testUrl = process.env.STUDY_TRACKER_TEST_URL || "http://127.0.0.1:8080";

if (!playwrightModule || !browserExecutable) {
  throw new Error("PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE are required");
}

const { chromium } = await import(playwrightModule);
const browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

async function assertToolbarFits(viewport) {
  await page.setViewportSize(viewport);
  const layout = await page.locator(".toolbar").evaluate(toolbar => ({
    toolbarScrollWidth: toolbar.scrollWidth,
    toolbarClientWidth: toolbar.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  assert.ok(layout.toolbarScrollWidth <= layout.toolbarClientWidth + 1, `Toolbar should fit at ${viewport.width}px`);
  assert.ok(layout.bodyScrollWidth <= layout.viewportWidth + 1, `Page should not overflow horizontally at ${viewport.width}px`);
}

try {
  await page.goto(testUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".language-switcher select");

  if (await page.locator("#welcomeModal.open").count()) {
    await page.selectOption("#welcomeLanguage", "en");
    await page.waitForFunction(() => document.documentElement.lang === "en");
    assert.equal(await page.locator("#welcomeTitle").textContent(), "Welcome to My Study Tracker");
    assert.equal(await page.locator("#welcomeForm button[type=submit]").textContent(), "Create test space");
    assert.equal(await page.locator(".language-switcher select").inputValue(), "en");

    await page.selectOption("#welcomeLanguage", "zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    assert.equal(await page.locator("#welcomeTitle").textContent(), "欢迎使用学习系统");
    assert.equal(await page.locator(".language-switcher select").inputValue(), "zh-CN");
  }

  for (let index = 0; index < 4; index += 1) {
    await page.selectOption(".language-switcher select", "en");
    await page.waitForFunction(() => document.documentElement.lang === "en");
    assert.equal(await page.locator("#appTitle").textContent(), "My Study Tracker");
    assert.equal(
      await page.locator(".cloud-share-state").locator("xpath=../preceding-sibling::p[1]").textContent(),
      "Only people with the link can view it. Your family cannot edit anything, and you can revoke the link at any time."
    );

    await page.selectOption(".language-switcher select", "zh-CN");
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    assert.equal(await page.locator("#appTitle").textContent(), "我的学习系统");
  }

  await page.selectOption(".language-switcher select", "en");
  await assertToolbarFits({ width: 2048, height: 900 });
  await assertToolbarFits({ width: 980, height: 900 });
  await assertToolbarFits({ width: 720, height: 900 });

  if (process.env.STUDY_TRACKER_INVITE_CODE) {
    const testEmail = `browser-${Date.now()}@example.com`;
    const testPassword = "browser-test-password";
    if (await page.locator("#welcomeModal.open").count()) {
      await page.locator("#ownerName").fill("Browser Test");
      await page.locator("#welcomeForm button[type=submit]").click();
    }

    await page.locator(".cloud-auth-btn").click();
    await page.locator("#cloudEmail").fill(testEmail);
    await page.locator("#cloudPassword").fill(testPassword);
    await page.locator("#cloudInviteCode").fill(process.env.STUDY_TRACKER_INVITE_CODE);
    await page.locator('.cloud-auth-form button[data-mode="register"]').click();
    await page.waitForSelector(".cloud-signout-btn:not([hidden])");
    if (await page.locator("#welcomeModal.open").count()) {
      await page.locator("#ownerName").fill("Browser Test Account");
      await page.locator("#welcomeForm button[type=submit]").click();
      await page.waitForSelector("#welcomeModal", { state: "hidden" });
    }

    const accountKeysBefore = await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes("study-tracker-online-account-v1:")));
    assert.ok(accountKeysBefore.length > 0, "Registered account should have a local cache");

    await page.locator(".cloud-signout-btn").click();
    await page.locator(".cloud-signout-clear").click();
    await page.waitForSelector(".cloud-auth-btn:not([hidden])");

    const remainingPrivateKeys = await page.evaluate(() => Object.keys(localStorage).filter(key =>
      key === "study-tracker-api-session-v1"
      || key === "study-tracker-online-guest-v1"
      || key.includes("study-tracker-online-account-v1:")
      || key.includes("study-tracker-online-sync-meta-v1:")
    ));
    assert.deepEqual(remainingPrivateKeys, [], "Clear-device logout should remove the current account and guest local data");
    assert.equal(await page.evaluate(() => localStorage.getItem("study-tracker-language-v1")), "zh-CN", "Clear-device logout should restore Chinese as the preferred language");
    assert.equal(await page.locator("#appTitle").textContent(), "我的学习系统", "Clear-device logout should restore Chinese and not keep the old account name in guest mode");
    assert.equal(await page.locator("#welcomeLanguage").inputValue(), "zh-CN", "Welcome language selector should return to Chinese after clearing device data");
    assert.ok(await page.locator("#welcomeModal.open").count(), "Clear-device logout should return to the welcome/create-space screen");

    await page.locator(".cloud-auth-btn").click();
    await page.locator("#cloudEmail").fill(testEmail);
    await page.locator("#cloudPassword").fill(testPassword);
    await page.locator('.cloud-auth-form button[data-mode="login"]').click();
    await page.waitForSelector(".cloud-signout-btn:not([hidden])");
    assert.equal(await page.locator("#appTitle").textContent(), "Browser Test Account的学习系统", "Cloud data should remain after clear-device logout");

    await page.locator(".cloud-signout-btn").click();
    await page.locator(".cloud-signout-keep").click();
    await page.waitForSelector(".cloud-auth-btn:not([hidden])");
    const keptAccountKeys = await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes("study-tracker-online-account-v1:")));
    assert.ok(keptAccountKeys.length > 0, "Normal logout should keep the current account's local cache");
    assert.equal(await page.evaluate(() => localStorage.getItem("study-tracker-api-session-v1")), null, "Normal logout should remove the login session");
  }

  assert.equal(pageErrors.length, 0, `Browser page errors: ${pageErrors.join("; ")}`);
  console.log("PASS browser language switching and secure logout smoke test");
} finally {
  await browser.close();
}
