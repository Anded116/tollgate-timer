import { browser } from 'wxt/browser';

/** Суточная сводка. Ключи короткие: карта живёт год и лежит в storage. */
export interface DayStat {
  /** Входы (заход состоялся). */
  v: number;
  /** Отказы: «Передумал» или закрытая вкладка со шлюзом. */
  d: number;
  /** Время, проведённое у шлюза, мс. */
  w: number;
  /** Входы по сайтам. */
  s: Record<string, number>;
}

export type StatsMap = Record<string, DayStat>;

const KEEP_DAYS = 400;

export function dayKey(d: Date | number = Date.now()): string {
  const dt = typeof d === 'number' ? new Date(d) : d;
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${day}`;
}

export function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

export async function getStats(): Promise<StatsMap> {
  const { stats } = await browser.storage.local.get('stats');
  return (stats as StatsMap | undefined) ?? {};
}

/** Дата первого запуска: до неё в сетке нет данных, а не «ноль заходов». */
export async function getFirstRun(): Promise<string> {
  const { firstRun } = await browser.storage.local.get('firstRun');
  return (firstRun as string | undefined) ?? dayKey();
}

export async function ensureFirstRun(): Promise<void> {
  const { firstRun } = await browser.storage.local.get('firstRun');
  if (!firstRun) await browser.storage.local.set({ firstRun: dayKey() });
}

async function bump(patch: (day: DayStat) => void, now = Date.now()): Promise<void> {
  const stats = await getStats();
  const key = dayKey(now);
  const day = stats[key] ?? { v: 0, d: 0, w: 0, s: {} };
  patch(day);
  stats[key] = day;

  const oldest = shiftDay(key, -KEEP_DAYS);
  for (const k of Object.keys(stats)) if (k < oldest) delete stats[k];

  await browser.storage.local.set({ stats });
}

export async function statEntry(site: string, waitedMs = 0, now = Date.now()): Promise<void> {
  await bump((day) => {
    day.v += 1;
    day.w += waitedMs;
    day.s[site] = (day.s[site] ?? 0) + 1;
  }, now);
}

export async function statDecline(waitedMs = 0, now = Date.now()): Promise<void> {
  await bump((day) => {
    day.d += 1;
    day.w += waitedMs;
  }, now);
}

/**
 * «Температура» дня: заходов на один посещённый сайт. Один заход на сайт — это
 * нормальный день (зелёный), а вот пятый заход на тот же Реддит — уже нет.
 */
export function dayHeat(day: DayStat | undefined): number {
  if (!day || day.v === 0) return 0;
  const sites = Object.keys(day.s).length || 1;
  return day.v / sites;
}

/** Уровень 0..4 для палитры: 0 — спокойный день, 4 — запой. */
export function heatLevel(day: DayStat | undefined): number {
  const h = dayHeat(day);
  if (h <= 1) return 0;
  if (h <= 2) return 1;
  if (h <= 3) return 2;
  if (h <= 5) return 3;
  return 4;
}

export interface Metrics {
  todayVisits: number;
  todayDeclines: number;
  /** Доля отказов за 7 дней, 0..1; null — попыток не было. */
  declineRate: number | null;
  /** Дней подряд «в зелёном», считая сегодня. */
  cleanStreak: number;
  /** Время у шлюза за 7 дней, мс. */
  waitedMs: number;
  /** Среднее заходов в день по прожитым дням окна: последние 7 и предыдущие 7. */
  avg7: number;
  avgPrev7: number;
}

function sumRange(stats: StatsMap, from: string, days: number) {
  let v = 0;
  let d = 0;
  let w = 0;
  for (let i = 0; i < days; i++) {
    const day = stats[shiftDay(from, i)];
    if (!day) continue;
    v += day.v;
    d += day.d;
    w += day.w;
  }
  return { v, d, w };
}

/** Сколько дней окна реально прожито: до первого запуска дней не было. */
function trackedDays(from: string, days: number, firstRun: string, today: string): number {
  let n = 0;
  for (let i = 0; i < days; i++) {
    const key = shiftDay(from, i);
    if (key >= firstRun && key <= today) n++;
  }
  return n;
}

export function aggregate(stats: StatsMap, firstRun: string, today = dayKey()): Metrics {
  const curFrom = shiftDay(today, -6);
  const prevFrom = shiftDay(today, -13);
  const cur = sumRange(stats, curFrom, 7);
  const prev = sumRange(stats, prevFrom, 7);
  // Делить на 7 нельзя: на свежей установке это занижает среднее в разы.
  const curDays = trackedDays(curFrom, 7, firstRun, today);
  const prevDays = trackedDays(prevFrom, 7, firstRun, today);
  const attempts = cur.v + cur.d;

  let cleanStreak = 0;
  for (let i = 0; ; i++) {
    const key = shiftDay(today, -i);
    if (key < firstRun) break;
    if (heatLevel(stats[key]) > 0) break;
    cleanStreak++;
  }

  const t = stats[today];
  return {
    todayVisits: t?.v ?? 0,
    todayDeclines: t?.d ?? 0,
    declineRate: attempts > 0 ? cur.d / attempts : null,
    cleanStreak,
    waitedMs: cur.w,
    avg7: curDays > 0 ? cur.v / curDays : 0,
    avgPrev7: prevDays > 0 ? prev.v / prevDays : 0,
  };
}

export interface GridCell {
  key: string;
  day: DayStat | undefined;
  /** До первого запуска данных нет — такие дни не красим как «ноль». */
  tracked: boolean;
}

/**
 * Сетка на год: столбец = неделя (пн—вс), последний столбец содержит сегодня.
 * Возвращается по столбцам, чтобы вёрстка не занималась арифметикой дат.
 */
export function yearGrid(stats: StatsMap, firstRun: string, today = dayKey(), weeks = 53): GridCell[][] {
  const [y, m, d] = today.split('-').map(Number);
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7; // 0 = понедельник
  const start = shiftDay(today, -(weeks - 1) * 7 - weekday);

  const cols: GridCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: GridCell[] = [];
    for (let i = 0; i < 7; i++) {
      const key = shiftDay(start, w * 7 + i);
      col.push({ key, day: stats[key], tracked: key >= firstRun && key <= today });
    }
    cols.push(col);
  }
  return cols;
}
