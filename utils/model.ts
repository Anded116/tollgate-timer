import { t } from './i18n';

export interface Settings {
  /** Домены под контролем (без www, без протокола). */
  sites: string[];
  /** Сколько «бесплатных» заходов до появления таймера. */
  freeVisits: number;
  /** Базовая задержка первого платного захода, секунды. */
  baseSec: number;
  /** Множитель роста задержки за каждый следующий заход. */
  growth: number;
  /** Потолок задержки, минуты. */
  capMin: number;
  /** Период распада счётчика заходов, часы (за tau часов вес захода падает в e раз). */
  tauHours: number;
  /** Возврат на сайт в течение этого времени — продолжение сессии, а не новый заход. Минуты. */
  cooldownMin: number;
  /** Максимальный возраст сессии: спустя это время после её начала возврат считается новым заходом. Минуты. */
  sessionMaxMin: number;
  /** Общий счётчик на все сайты (true) или свой у каждого домена (false). */
  sharedPool: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sites: [
    'reddit.com',
    'youtube.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'tiktok.com',
    'facebook.com',
    'twitch.tv',
    'vk.com',
    'pikabu.ru',
    'dtf.ru',
  ],
  freeVisits: 2,
  baseSec: 15,
  growth: 1.7,
  capMin: 10,
  tauHours: 6,
  cooldownMin: 5,
  sessionMaxMin: 20,
  sharedPool: false,
};

export interface Preset {
  key: string;
  labelKey: string;
  values: Omit<Settings, 'sites' | 'sharedPool'>;
}

export const PRESETS: Preset[] = [
  {
    key: 'soft',
    labelKey: 'presetSoft',
    values: { freeVisits: 3, baseSec: 10, growth: 1.5, capMin: 5, tauHours: 4, cooldownMin: 5, sessionMaxMin: 30 },
  },
  {
    key: 'medium',
    labelKey: 'presetMedium',
    values: { freeVisits: 2, baseSec: 15, growth: 1.7, capMin: 10, tauHours: 6, cooldownMin: 5, sessionMaxMin: 20 },
  },
  {
    key: 'hard',
    labelKey: 'presetHard',
    values: { freeVisits: 1, baseSec: 20, growth: 2.0, capMin: 15, tauHours: 8, cooldownMin: 3, sessionMaxMin: 10 },
  },
];

/**
 * Эффективное число заходов: каждый заход весит 1 и экспоненциально
 * тает со временем. Никаких суточных сбросов — утро само «обнуляется».
 */
export function effectiveCount(timestamps: number[], tauHours: number, now = Date.now()): number {
  const tauMs = tauHours * 3_600_000;
  let sum = 0;
  for (const t of timestamps) {
    const age = now - t;
    if (age >= 0) sum += Math.exp(-age / tauMs);
  }
  return sum;
}

/** Задержка перед входом (в секундах) при текущем эффективном счётчике. */
export function delayFor(count: number, s: Settings): number {
  if (count < s.freeVisits) return 0;
  const d = s.baseSec * Math.pow(s.growth, count - s.freeVisits);
  return Math.min(d, s.capMin * 60);
}

/** Вернёт домен из списка, которому принадлежит hostname, либо null. */
export function matchSite(hostname: string, sites: string[]): string | null {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  for (const raw of sites) {
    const s = raw.toLowerCase();
    if (h === s || h.endsWith('.' + s)) return s;
  }
  return null;
}

/** Нормализация пользовательского ввода домена: url/www/пробелы → голый домен. */
export function normalizeSite(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split(/[/?#]/)[0];
  if (!/^[a-z0-9а-яё.-]+\.[a-zа-яё]{2,}$/i.test(s)) return null;
  return s;
}

export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return t('unitSec', String(s));
  return `${m}:${String(s).padStart(2, '0')}`;
}
