import { browser } from 'wxt/browser';
import { delayFor, formatDuration, freeReturnMsLeft, matchSite } from '../../utils/model';
import { countToday, currentCount, getSessionTimes, getSettings, getTabSites, getVisits } from '../../utils/store';
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

async function renderList() {
  const settings = await getSettings();
  const visits = await getVisits();
  const now = Date.now();
  const $list = document.getElementById('list')!;
  $list.textContent = '';

  for (const site of settings.sites) {
    const today = countToday(visits[site] ?? [], now);
    const count = await currentCount(site, settings, now);
    const delaySec = delayFor(count, settings);

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
    $list.append(li);
  }
}

document.getElementById('open-options')!.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

applyI18n();
renderStatus();
renderList();
