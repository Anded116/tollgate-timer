import { browser } from 'wxt/browser';
import { delayFor, formatDuration, freeReturnMsLeft, matchSite } from '../../utils/model';
import { countToday, currentCount, getSessionTimes, getSettings, getTabSites, getVisits } from '../../utils/store';
import {
  aggregate,
  dayKey,
  getFirstRun,
  getStats,
  heatLevel,
  yearGrid,
  type Metrics,
} from '../../utils/stats';
import { applyI18n, t } from '../../utils/i18n';

async function renderStatus() {
  const settings = await getSettings();
  const $status = document.getElementById('status')!;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  let host = '';
  try {
    const u = new URL(tab?.url ?? '');
    if (u.protocol === 'http:' || u.protocol === 'https:') host = u.hostname;
  } catch {
    // не веб-страница (about:, moz-extension: и т.п.)
  }
  if (!host) return;

  $status.hidden = false;
  const site = matchSite(host, settings.sites);
  const title = document.createElement('div');
  const why = document.createElement('div');
  why.className = 'why';

  if (!site) {
    $status.classList.add('off');
    title.textContent = t('popupNotListed', host);
    why.textContent = t('popupNotListedWhy');
  } else {
    title.textContent = `${host} → ${site}`;
    const now = Date.now();
    const tabSites = await getTabSites();
    const thisTabOnSite = tab?.id != null && tabSites[String(tab.id)] === site;
    const freeLeft = freeReturnMsLeft(await getSessionTimes(site), settings, now);
    const delaySec = delayFor(await currentCount(site, settings, now), settings);
    const nextEntry =
      delaySec > 0 ? t('popupPriceTimer', formatDuration(delaySec)) : t('popupPriceFree');

    if (thisTabOnSite) {
      why.textContent = t('popupInSession', nextEntry);
    } else if (freeLeft > 0) {
      why.textContent = t('popupReturnFree', [formatDuration(freeLeft / 1000), nextEntry]);
    } else {
      why.textContent = t('popupNewEntry', nextEntry);
    }
  }
  $status.replaceChildren(title, why);
}

function tile(value: string, label: string, sub?: { text: string; tone: 'good' | 'bad' | 'flat' }) {
  const el = document.createElement('div');
  el.className = 'tile';

  const val = document.createElement('div');
  val.className = 'val';
  val.textContent = value;

  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  lbl.textContent = label;
  el.append(val, lbl);

  if (sub) {
    const s = document.createElement('div');
    s.className = `sub ${sub.tone}`;
    s.textContent = sub.text;
    el.append(s);
  }
  return el;
}

function renderMetrics(m: Metrics) {
  const $metrics = document.getElementById('metrics')!;

  // Тренд недели к предыдущей: меньше заходов — хорошо.
  let trend: { text: string; tone: 'good' | 'bad' | 'flat' };
  if (m.avgPrev7 === 0) {
    trend = { text: '—', tone: 'flat' };
  } else {
    const pct = Math.round(((m.avg7 - m.avgPrev7) / m.avgPrev7) * 100);
    trend = {
      text: t('statVsPrevWeek', `${pct > 0 ? '+' : ''}${pct}%`),
      tone: pct < 0 ? 'good' : pct > 0 ? 'bad' : 'flat',
    };
  }

  const waitedMin = Math.round(m.waitedMs / 60_000);

  $metrics.replaceChildren(
    tile(String(m.todayVisits), t('statToday'), {
      text: t('statAvgWeek', m.avg7.toFixed(1)),
      tone: 'flat',
    }),
    tile(
      m.declineRate === null ? '—' : `${Math.round(m.declineRate * 100)}%`,
      t('statDeclined'),
      { text: t('statDeclinedHint'), tone: 'flat' },
    ),
    tile(String(m.cleanStreak), t('statStreak'), trend),
    tile(t('unitMin', String(waitedMin)), t('statWaited'), {
      text: t('statWaitedHint'),
      tone: 'flat',
    }),
  );
}

function renderHeat(cols: ReturnType<typeof yearGrid>, today: string, hasData: boolean) {
  const $heat = document.getElementById('heat')!;
  const cells: HTMLElement[] = [];

  for (const col of cols) {
    for (const cell of col) {
      const el = document.createElement('div');
      el.className = 'cell';
      if (cell.tracked) {
        el.classList.add(`lvl-${heatLevel(cell.day)}`);
        const v = cell.day?.v ?? 0;
        const d = cell.day?.d ?? 0;
        el.title = t('heatTip', [cell.key, String(v), String(d)]);
      } else {
        el.title = t('heatTipNoData', cell.key);
      }
      if (cell.key === today) el.classList.add('today');
      cells.push(el);
    }
  }
  $heat.replaceChildren(...cells);
  renderMonths(cols);
  (document.getElementById('heat-empty') as HTMLElement).hidden = hasData;
}

/** Подписи месяцев над сеткой: метка занимает столбцы своего месяца. */
function renderMonths(cols: ReturnType<typeof yearGrid>) {
  const fmt = new Intl.DateTimeFormat(browser.i18n.getUILanguage(), { month: 'short' });

  // Столбец относим к месяцу его последнего дня — так метка не убегает влево.
  const starts: { col: number; date: Date }[] = [];
  let prevMonth = -1;
  cols.forEach((col, i) => {
    const [y, m, d] = col[0].key.split('-').map(Number);
    const last = new Date(y, m - 1, d + 6);
    if (last.getMonth() === prevMonth) return;
    prevMonth = last.getMonth();
    starts.push({ col: i + 1, date: last });
  });

  const labels = starts.map(({ col, date }, i) => {
    const end = starts[i + 1]?.col ?? cols.length + 1;
    const span = document.createElement('span');
    span.style.gridColumn = `${col} / ${end}`;
    // Узкой полосе текст не помещается — оставляем её пустой.
    if (end - col >= 3) span.textContent = fmt.format(date);
    return span;
  });
  document.getElementById('heat-months')!.replaceChildren(...labels);
}

async function renderList() {
  const settings = await getSettings();
  const visits = await getVisits();
  const now = Date.now();
  const $list = document.getElementById('list')!;
  const items: HTMLElement[] = [];

  const rows = [];
  for (const site of settings.sites) {
    rows.push({
      site,
      today: countToday(visits[site] ?? [], now),
      delaySec: delayFor(await currentCount(site, settings, now), settings),
    });
  }
  // Попап ограничен по высоте, поэтому показываем самое горячее.
  rows.sort((a, b) => b.today - a.today || b.delaySec - a.delaySec);

  for (const { site, today, delaySec } of rows.slice(0, 5)) {
    const li = document.createElement('li');
    const domain = document.createElement('span');
    domain.className = 'domain';
    domain.textContent = site;

    const stats = document.createElement('span');
    stats.className = 'stats';
    const price = document.createElement('span');
    if (delaySec > 0) price.className = 'hot';
    price.textContent = delaySec > 0 ? formatDuration(delaySec) : t('listFree');
    stats.append(`${today} · `, price);

    li.append(domain, stats);
    items.push(li);
  }
  $list.replaceChildren(...items);
}

async function renderStats() {
  const [stats, firstRun] = await Promise.all([getStats(), getFirstRun()]);
  const today = dayKey();
  renderMetrics(aggregate(stats, firstRun, today));
  renderHeat(yearGrid(stats, firstRun, today), today, Object.keys(stats).length > 0);
}

document.getElementById('open-options')!.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

applyI18n();
renderStatus();
renderStats();
renderList();
