import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, effectiveCount, matchSite, type SessionTimes, type Settings } from './model';

type VisitMap = Record<string, number[]>;
type TimeMap = Record<string, number>;
/** tabId → сайт из списка, который реально загружен (committed) в этой вкладке. */
type TabSiteMap = Record<string, string>;

export async function getSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get('settings');
  if (settings) return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings>) };

  // Настройки версии 0.1 жили в storage.sync — переносим и больше туда не пишем:
  // sync недоступен в части сборок на базе Firefox и падает молча.
  try {
    const legacy = await browser.storage.sync.get('settings');
    if (legacy.settings) {
      const merged = { ...DEFAULT_SETTINGS, ...(legacy.settings as Partial<Settings>) };
      await browser.storage.local.set({ settings: merged });
      return merged;
    }
  } catch {
    // sync недоступен — просто берём дефолты
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}

export async function getVisits(): Promise<VisitMap> {
  const { visits } = await browser.storage.local.get('visits');
  return (visits as VisitMap | undefined) ?? {};
}

export async function recordVisit(site: string, tauHours: number, now = Date.now()): Promise<void> {
  const visits = await getVisits();
  const keepMs = Math.max(48, tauHours * 4) * 3_600_000;
  const list = (visits[site] ?? []).filter((t) => now - t < keepMs);
  list.push(now);
  visits[site] = list;

  const stored = await browser.storage.local.get(['leftAt', 'sessionStart', 'closedAt']);
  const left: TimeMap = (stored.leftAt as TimeMap | undefined) ?? {};
  const start: TimeMap = (stored.sessionStart as TimeMap | undefined) ?? {};
  const closed: TimeMap = (stored.closedAt as TimeMap | undefined) ?? {};
  left[site] = now;
  start[site] = now;
  closed[site] = 0;

  await browser.storage.local.set({ visits, leftAt: left, sessionStart: start, closedAt: closed });
}

export async function getSessionTimes(site: string): Promise<SessionTimes> {
  const s = await browser.storage.local.get(['leftAt', 'sessionStart', 'closedAt']);
  return {
    leftAt: (s.leftAt as TimeMap | undefined)?.[site] ?? 0,
    sessionStart: (s.sessionStart as TimeMap | undefined)?.[site] ?? 0,
    closedAt: (s.closedAt as TimeMap | undefined)?.[site] ?? 0,
  };
}

export async function getTabSites(): Promise<TabSiteMap> {
  const { tabSites } = await browser.storage.local.get('tabSites');
  return (tabSites as TabSiteMap | undefined) ?? {};
}

/**
 * Обновить привязку вкладки к сайту. Когда последняя вкладка сайта уходит с него,
 * фиксируется момент ухода; closed=true означает, что вкладку закрыли, — такой
 * уход завершает сессию почти сразу.
 */
export async function setTabSite(
  tabId: number,
  site: string | null,
  now = Date.now(),
  closed = false,
): Promise<void> {
  const tabSites = await getTabSites();
  const key = String(tabId);
  const prev = tabSites[key];
  if (site) tabSites[key] = site;
  else delete tabSites[key];

  const updates: Record<string, unknown> = { tabSites };
  if (prev && prev !== site && !Object.values(tabSites).includes(prev)) {
    const stored = await browser.storage.local.get(['leftAt', 'closedAt']);
    const left: TimeMap = (stored.leftAt as TimeMap | undefined) ?? {};
    left[prev] = now;
    updates.leftAt = left;
    if (closed) {
      const closedMap: TimeMap = (stored.closedAt as TimeMap | undefined) ?? {};
      closedMap[prev] = now;
      updates.closedAt = closedMap;
    }
  }
  await browser.storage.local.set(updates);
}

/** Вкладка, показывающая шлюз: нужна, чтобы поймать уход без нажатия кнопок. */
interface GateTab {
  site: string;
  at: number;
  /** Активное время у шлюза, мс: только пока вкладка видима и в фокусе. */
  waited: number;
}

export async function markGateTab(tabId: number, site: string, at = Date.now()): Promise<void> {
  const { gateTabs } = await browser.storage.local.get('gateTabs');
  const map = (gateTabs as Record<string, GateTab> | undefined) ?? {};
  map[String(tabId)] = { site, at, waited: 0 };
  await browser.storage.local.set({ gateTabs: map });
}

/**
 * Сохранить активное время ожидания у шлюза. Страница шлюза докладывает его
 * сама: настенные часы тут не годятся — вкладка со шлюзом может часами лежать
 * в фоне, где круг не тикает, и это не ожидание.
 */
export async function updateGateWait(tabId: number, waited: number): Promise<void> {
  const { gateTabs } = await browser.storage.local.get('gateTabs');
  const map = (gateTabs as Record<string, GateTab> | undefined) ?? {};
  const entry = map[String(tabId)];
  if (!entry) return;
  entry.waited = waited;
  await browser.storage.local.set({ gateTabs: map });
}

/** Забрать и снять отметку: вернёт запись, если вкладка стояла у шлюза. */
export async function takeGateTab(tabId: number): Promise<GateTab | null> {
  const { gateTabs } = await browser.storage.local.get('gateTabs');
  const map = (gateTabs as Record<string, GateTab> | undefined) ?? {};
  const key = String(tabId);
  const entry = map[key];
  if (!entry) return null;
  delete map[key];
  await browser.storage.local.set({ gateTabs: map });
  return entry;
}

/** Пересобрать карту вкладок с нуля по реальным вкладкам (на старте фона). */
export async function rebuildTabSites(sites: string[]): Promise<void> {
  const tabs = await browser.tabs.query({});
  const tabSites: TabSiteMap = {};
  for (const t of tabs) {
    if (t.id == null || !t.url) continue;
    try {
      const site = matchSite(new URL(t.url).hostname, sites);
      if (site) tabSites[String(t.id)] = site;
    } catch {
      // невалидный url вкладки
    }
  }
  await browser.storage.local.set({ tabSites });
}

/**
 * Эффективный счётчик заходов для сайта с учётом настройки sharedPool:
 * при общем пуле суммируются заходы на все контролируемые сайты.
 */
export async function currentCount(site: string, settings: Settings, now = Date.now()): Promise<number> {
  const visits = await getVisits();
  const stamps = settings.sharedPool
    ? settings.sites.flatMap((s) => visits[s] ?? [])
    : (visits[site] ?? []);
  return effectiveCount(stamps, settings.tauHours, now);
}

/** Сырое число заходов с местной полуночи — для статистики. */
export function countToday(stamps: number[], now = Date.now()): number {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const from = midnight.getTime();
  return stamps.filter((t) => t >= from).length;
}
