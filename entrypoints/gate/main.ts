import { browser } from 'wxt/browser';
import { delayFor, formatDuration } from '../../utils/model';
import { applyI18n, t } from '../../utils/i18n';
import { currentCount, getSettings, getVisits, recordVisit, countToday, takeGateTab } from '../../utils/store';
import { statDecline, statEntry } from '../../utils/stats';

applyI18n();

const openedAt = Date.now();

const params = new URLSearchParams(location.search);
const target = params.get('target') ?? '';
const site = params.get('site') ?? '';

const $site = document.getElementById('site')!;
const $visitLine = document.getElementById('visit-line')!;
const $time = document.getElementById('time')!;
const $paused = document.getElementById('paused')!;
const $progress = document.getElementById('progress') as unknown as SVGCircleElement;
const $enter = document.getElementById('enter') as HTMLButtonElement;
const $leave = document.getElementById('leave') as HTMLButtonElement;
const $dial = document.querySelector('.dial')!;

const CIRCUMFERENCE = 2 * Math.PI * 96;
$progress.style.strokeDasharray = String(CIRCUMFERENCE);
$progress.style.strokeDashoffset = String(CIRCUMFERENCE);

async function init() {
  if (!site || !target) {
    location.href = 'about:blank';
    return;
  }

  $site.textContent = site;

  const settings = await getSettings();
  const now = Date.now();
  const count = await currentCount(site, settings, now);
  const delayMs = delayFor(count, settings) * 1000;

  const visits = await getVisits();
  const today = countToday(visits[site] ?? []) + 1;
  const poolNote = settings.sharedPool ? ' ' + t('gateSharedPool') : '';
  $visitLine.textContent = t('gateVisitLine', String(today)) + poolNote;

  let acc = 0;
  let lastTick: number | null = null;
  let done = false;

  function frame(ts: number) {
    const active = document.visibilityState === 'visible' && document.hasFocus();
    if (active && !done) {
      if (lastTick !== null) acc += ts - lastTick;
      lastTick = ts;
    } else {
      lastTick = null;
    }
    $paused.hidden = active || done;

    const progress = Math.min(1, acc / delayMs);
    $progress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));

    if (progress >= 1 && !done) {
      done = true;
      $dial.classList.add('done');
      $time.textContent = '0:00';
      $enter.disabled = false;
      $enter.focus();
    } else if (!done) {
      $time.textContent = formatDuration((delayMs - acc) / 1000);
    }

    if (!done) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  $enter.addEventListener('click', async () => {
    if (!done) return;
    $enter.disabled = true;
    const tab = await browser.tabs.getCurrent();
    if (tab?.id != null) await takeGateTab(tab.id);
    await recordVisit(site, settings.tauHours);
    await statEntry(site, Date.now() - openedAt);
    location.href = target;
  });
}

$leave.addEventListener('click', async () => {
  const tab = await browser.tabs.getCurrent();
  if (tab?.id != null) await takeGateTab(tab.id);
  await statDecline(Date.now() - openedAt);
  if (tab?.id != null) {
    await browser.tabs.remove(tab.id);
  } else {
    window.close();
  }
});

init();
