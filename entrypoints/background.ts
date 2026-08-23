import { browser } from 'wxt/browser';
import { delayFor, freeReturnMsLeft, matchSite } from '../utils/model';
import {
  currentCount,
  getSessionTimes,
  getSettings,
  getTabSites,
  markGateTab,
  rebuildTabSites,
  recordVisit,
  setTabSite,
  takeGateTab,
} from '../utils/store';
import { ensureFirstRun, statDecline, statEntry } from '../utils/stats';

function siteFromUrl(url: string, sites: string[]): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return matchSite(u.hostname, sites);
  } catch {
    return null;
  }
}

/** Вкладка, из которой открыли эту, уже на сайте — переход по ссылке внутри сессии. */
async function openerOnSite(tabId: number, site: string, tabSites: Record<string, string>) {
  try {
    const tab = await browser.tabs.get(tabId);
    const opener = tab.openerTabId;
    return opener != null && tabSites[String(opener)] === site;
  } catch {
    return false;
  }
}

/**
 * Нужен ли шлюз для входа на site в этой вкладке.
 * Свободны: навигация внутри той же вкладки, уже находящейся на сайте, и
 * переход по ссылке в новую вкладку с самого сайта. Открытая ГДЕ-ТО ЕЩЁ вкладка
 * сайта права на бесплатный вход НЕ даёт — иначе одна закреплённая вкладка
 * (или чужой редирект, успевший загрузить сайт) навсегда отключает таймер.
 */
async function needsGate(site: string, tabId: number, now: number): Promise<boolean> {
  const settings = await getSettings();
  const tabSites = await getTabSites();

  if (tabSites[String(tabId)] === site) return false;
  if (await openerOnSite(tabId, site, tabSites)) return false;

  // Возврат внутрь живой сессии — не новый заход.
  if (freeReturnMsLeft(await getSessionTimes(site), settings, now) > 0) return false;

  const delaySec = delayFor(await currentCount(site, settings, now), settings);
  if (delaySec <= 0) {
    // Бесплатный заход: пускаем сразу, но считаем.
    await recordVisit(site, settings.tauHours, now);
    await statEntry(site, 0, now);
    return false;
  }
  return true;
}

async function sendToGate(tabId: number, site: string, target: string) {
  const gateUrl =
    browser.runtime.getURL('/gate.html') +
    `?target=${encodeURIComponent(target)}&site=${encodeURIComponent(site)}`;
  await markGateTab(tabId, site);
  await browser.tabs.update(tabId, { url: gateUrl });
}

/** Ушёл от шлюза, не войдя, — это отказ, даже если кнопку не нажимал. */
async function countAbandon(tabId: number): Promise<void> {
  const gate = await takeGateTab(tabId);
  if (gate) await statDecline(gate.waited);
}

export default defineBackground(() => {
  // Актуализировать карту «вкладка → сайт» при каждом старте фона:
  // после перезапуска браузера старые tabId недействительны.
  getSettings()
    .then((s) => rebuildTabSites(s.sites))
    .catch((e) => console.error('[tollgate] rebuild failed', e));
  ensureFirstRun().catch((e) => console.error('[tollgate] firstRun failed', e));

  browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
    try {
      if (details.frameId !== 0) return;
      const settings = await getSettings();
      const site = siteFromUrl(details.url, settings.sites);
      if (!site) return;
      if (await needsGate(site, details.tabId, Date.now())) {
        await sendToGate(details.tabId, site, details.url);
      }
    } catch (e) {
      console.error('[tollgate] gate check failed', e);
    }
  });

  // Страховка: сайт всё-таки загрузился в обход перехвата — так бывает при
  // редиректах ДРУГИХ расширений (youtube.com -> /feed/subscriptions) и при
  // клиентской навигации. Присутствие на сайте фиксируется здесь же.
  browser.webNavigation.onCommitted.addListener(async (details) => {
    try {
      if (details.frameId !== 0) return;
      const settings = await getSettings();
      const site = siteFromUrl(details.url, settings.sites);

      if (site && (await needsGate(site, details.tabId, Date.now()))) {
        await sendToGate(details.tabId, site, details.url);
        return;
      }
      // Страница шлюза — это ещё не уход от него.
      if (!details.url.startsWith(browser.runtime.getURL('/gate.html'))) {
        await countAbandon(details.tabId);
      }
      await setTabSite(details.tabId, site);
    } catch (e) {
      console.error('[tollgate] onCommitted failed', e);
    }
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    try {
      await countAbandon(tabId);
      await setTabSite(tabId, null, Date.now(), true);
    } catch (e) {
      console.error('[tollgate] onRemoved failed', e);
    }
  });
});
