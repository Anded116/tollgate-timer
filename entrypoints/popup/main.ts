import { browser } from 'wxt/browser';
import { delayFor, formatDuration, matchSite } from '../../utils/model';
import { countToday, currentCount, getSessionTimes, getSettings, getTabSites, getVisits } from '../../utils/store';

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
    title.textContent = `${host} — не в списке`;
    why.textContent = 'Добавь домен в настройках и нажми «Сохранить».';
  } else {
    title.textContent = `${host} → ${site}`;
    const now = Date.now();
    const tabSites = await getTabSites();
    const thisTabOnSite = tab?.id != null && tabSites[String(tab.id)] === site;
    const { leftAt, sessionStart } = await getSessionTimes(site);
    const freeLeft = Math.min(
      settings.cooldownMin * 60_000 - (now - leftAt),
      settings.sessionMaxMin * 60_000 - (now - sessionStart),
    );
    const delaySec = delayFor(await currentCount(site, settings, now), settings);
    const nextEntry = delaySec > 0 ? `таймер ${formatDuration(delaySec)}` : 'без таймера (есть бесплатные заходы)';

    if (thisTabOnSite) {
      why.textContent = `Ты внутри сессии: навигация в этой вкладке свободна. Новый вход в другой вкладке — ${nextEntry}.`;
    } else if (freeLeft > 0) {
      why.textContent = `Возврат в сессию свободен ещё ${formatDuration(freeLeft / 1000)}, дальше — ${nextEntry}.`;
    } else {
      why.textContent = `Новый вход: ${nextEntry}.`;
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
    price.textContent = delaySec > 0 ? formatDuration(delaySec) : 'свободно';
    stats.append(`${today} · `, price);

    li.append(domain, stats);
    $list.append(li);
  }
}

document.getElementById('open-options')!.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

renderStatus();
renderList();
