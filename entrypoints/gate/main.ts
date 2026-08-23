import { browser } from 'wxt/browser';
import { delayFor, formatDuration } from '../../utils/model';
import { applyI18n, t } from '../../utils/i18n';
import {
  countToday,
  currentCount,
  getSettings,
  getVisits,
  recordVisit,
  takeGateTab,
  updateGateWait,
} from '../../utils/store';
import { statDecline, statEntry } from '../../utils/stats';

applyI18n();

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

/** Активное время у шлюза: только пока вкладка видима и в фокусе. */
let acc = 0;
let tabId: number | null = null;

const CIRCUMFERENCE = 2 * Math.PI * 96;
$progress.style.strokeDasharray = String(CIRCUMFERENCE);
$progress.style.strokeDashoffset = String(CIRCUMFERENCE);

async function init() {
  if (!site || !target) {
    location.href = 'about:blank';
    return;
  }

  $site.textContent = site;
  tabId = (await browser.tabs.getCurrent())?.id ?? null;

  const settings = await getSettings();
  const now = Date.now();
  const count = await currentCount(site, settings, now);
  const delayMs = delayFor(count, settings) * 1000;

  const visits = await getVisits();
  const today = countToday(visits[site] ?? []) + 1;
  const poolNote = settings.sharedPool ? ' ' + t('gateSharedPool') : '';
  $visitLine.textContent = t('gateVisitLine', String(today)) + poolNote;

  let lastTick: number | null = null;
  let done = false;
  let reported = 0;

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

    // Фон должен знать активное время, даже если вкладку просто закроют.
    if (tabId != null && acc - reported >= 1000) {
      reported = acc;
      void updateGateWait(tabId, Math.round(acc));
    }

    if (!done) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  $enter.addEventListener('click', async () => {
    if (!done) return;
    $enter.disabled = true;
    if (tabId != null) await takeGateTab(tabId);
    await recordVisit(site, settings.tauHours);
    await statEntry(site, Math.round(acc));
    location.href = target;
  });

}

$leave.addEventListener('click', async () => {
  if (tabId != null) await takeGateTab(tabId);
  await statDecline(Math.round(acc));
  if (tabId != null) {
    await browser.tabs.remove(tabId);
  } else {
    window.close();
  }
});

init();
