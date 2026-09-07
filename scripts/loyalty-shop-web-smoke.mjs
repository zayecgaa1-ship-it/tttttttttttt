import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ reducedMotion: "reduce" });
let points = 1_600;
let purchaseCount = 0;
const shop = [
  { key: "double-24h", name: "مضاعف الولاء ×2", description: "ضاعف النقاط التي تكسبها لمدة 24 ساعة.", icon: "⚡", price: 450, kind: "TIMED", owned: false, active: false },
  { key: "lfg-priority-7d", name: "أولوية غرف LFG", description: "ضع غرفك في مقدمة القائمة لمدة أسبوع.", icon: "🚀", price: 700, kind: "TIMED", owned: false, active: false },
  { key: "gold-badge", name: "الشارة الذهبية", description: "شارة دائمة بجانب اسمك.", icon: "🏅", price: 1_000, kind: "PERMANENT", owned: true, active: true },
  { key: "vip", name: "Zark VIP · 3 أيام", description: "×1.5 لنقاط الولاء وXP لمدة 3 أيام.", icon: "💎", price: 2_500, kind: "TIMED", owned: false, active: false },
];
const loyalty = () => ({
  points, lifetimePoints: 2_100, vipUnlocked: false, loyaltyBadge: "GOLD",
  tier: { name: "Zark Elite", threshold: 1_500 }, nextTier: undefined, vipPrice: 2_500,
  shop, recent: [{ amount: 35, reason: "إكمال جلسة LFG", createdAt: new Date().toISOString() }],
});
const profile = {
  displayName: "لاعب المتجر", avatarUrl: "", loyalty: { points, lifetimePoints: 2_100, vipUnlocked: false, badge: "GOLD" },
  settings: { bio: "", profileAccent: "#e50914", activityVisible: true, rivalNotificationsEnabled: true, currentActivity: "AWAY", mentionPolicy: "EVERYONE", weeklyAvailability: [] },
  zark: { level: 4, xp: 900, wins: 12, streak: 2, games: [] },
  lfg: { engagement: 80, completedSessions: 5, uniqueTeammates: 4, voiceSeconds: 600, activeRooms: [], favoriteGames: [], interests: [], rating: { average: null, count: 0, topTags: [] } },
};
const availability = { currentActivity: "AWAY", mentionPolicy: "EVERYONE", weeklyAvailability: [] };

await context.addInitScript(() => {
  localStorage.setItem("zark-tutorial-v4", JSON.stringify({ pausedVersion: 4 }));
  window.EventSource = class { constructor(){window.testStream=this} close() {} };
});
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/me") return route.fulfill({ json: { user: { userId: "shopper", displayName: "لاعب المتجر" } } });
    if (url.pathname === "/api/state") return route.fulfill({ json: { rooms: [], lfgGames: [], zarkGames: [], leaderboard: [] } });
    if (url.pathname === "/api/me/profile") return route.fulfill({ json: { ...profile, loyalty: { ...profile.loyalty, points } } });
    if (url.pathname === "/api/me/availability") return route.fulfill({ json: availability });
    if (url.pathname === "/api/me/loyalty") return route.fulfill({ json: loyalty() });
    if (request.method() === "POST" && url.pathname === "/api/me/loyalty/shop/double-24h") {
      purchaseCount += 1; points -= 450;
      Object.assign(shop[0], { active: true, activeUntil: new Date(Date.now() + 86_400_000).toISOString() });
      return route.fulfill({ json: loyalty() });
    }
    return route.fulfill({ json: {} });
  }
  const file = path.resolve("apps/web/public", "." + url.pathname);
  if (!file.startsWith(path.resolve("apps/web/public") + path.sep) || !existsSync(file)) return route.fulfill({ status: 404, body: "" });
  return route.fulfill({ body: readFileSync(file), contentType: { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" }[path.extname(file)] });
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto("https://zark.local/profile.html");
  await page.waitForSelector(".loyalty-reward");
  assert.equal(await page.locator(".loyalty-reward").count(), 4);
  await page.locator('#profile-setting-bio').fill('Unsaved profile edit');
  await page.evaluate(()=>{for(let i=0;i<20;i++)window.testStream.onmessage({data:JSON.stringify({eventType:'lfg.updated'})})});
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#profile-setting-bio').inputValue(),'Unsaved profile edit','Realtime preserves unsaved profile changes');
  assert.match(await page.locator("#profile-name").innerText(), /🏅/);
  assert.equal(await page.locator('[data-loyalty-reward="gold-badge"]').isDisabled(), true);
  assert.equal(await page.locator('[data-loyalty-reward="vip"]').isDisabled(), true);
  await page.locator('[data-loyalty-reward="double-24h"]').click();
  await page.waitForFunction(() => document.querySelector("#loyalty-shop-result")?.textContent?.includes("تم شراء"));
  assert.equal(purchaseCount, 1);
  assert.match(await page.locator('[data-loyalty-reward="double-24h"]').locator("xpath=..").innerText(), /مفعلة حتى/);
  assert.match(await page.locator(".loyalty-wallet").innerText(), /١٬١٥٠|1,150/);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow at ${width}`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS: loyalty shop renders, ownership and balance guards work, purchase updates immediately, and mobile layout has no overflow.");
} finally {
  await browser.close();
}
