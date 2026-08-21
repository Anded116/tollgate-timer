import { delayFor, formatDuration, normalizeSite, PRESETS, type Settings } from '../../utils/model';
import { getSettings, saveSettings } from '../../utils/store';

const NUM_FIELDS = ['freeVisits', 'baseSec', 'growth', 'capMin', 'tauHours', 'cooldownMin', 'sessionMaxMin'] as const;
type NumField = (typeof NUM_FIELDS)[number];

const $ = (id: string) => document.getElementById(id)!;
const input = (id: NumField) => $(id) as HTMLInputElement;
const $sites = $('sites') as HTMLTextAreaElement;
const $sharedPool = $('sharedPool') as HTMLInputElement;
const $presets = $('presets');
const $preview = $('preview');
const $status = $('status');

function readForm(base: Settings): Settings {
  const s: Settings = { ...base };
  for (const f of NUM_FIELDS) {
    const v = parseFloat(input(f).value);
    const min = f === 'freeVisits' ? 0 : 0.000001;
    if (Number.isFinite(v) && v >= min) s[f] = v;
  }
  s.sharedPool = $sharedPool.checked;
  s.sites = [
    ...new Set(
      $sites.value
        .split('\n')
        .map(normalizeSite)
        .filter((x): x is string => x !== null),
    ),
  ];
  return s;
}

function fillForm(s: Settings) {
  for (const f of NUM_FIELDS) input(f).value = String(s[f]);
  $sharedPool.checked = s.sharedPool;
  $sites.value = s.sites.join('\n');
  updatePresetHighlight(s);
  updatePreview(s);
}

function updatePresetHighlight(s: Settings) {
  for (const btn of $presets.querySelectorAll('button')) {
    const preset = PRESETS.find((p) => p.key === btn.dataset.key)!;
    const active = NUM_FIELDS.every((f) => preset.values[f] === s[f]);
    btn.classList.toggle('active', active);
  }
}

function updatePreview(s: Settings) {
  const points = [1, 3, 5, 7, 10]
    .map((n) => {
      const d = delayFor(n - 1, s);
      return `${n}-й: ${d > 0 ? formatDuration(d) : 'сразу'}`;
    })
    .join(' · ');
  $preview.textContent = `Цена заходов подряд — ${points}`;
}

async function init() {
  let settings = await getSettings();

  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.textContent = p.label;
    btn.dataset.key = p.key;
    btn.addEventListener('click', () => {
      const current = readForm(settings);
      fillForm({ ...current, ...p.values });
    });
    $presets.append(btn);
  }

  fillForm(settings);

  document.body.addEventListener('input', () => {
    const s = readForm(settings);
    updatePresetHighlight(s);
    updatePreview(s);
    $status.textContent = '';
  });

  $('save').addEventListener('click', async () => {
    const next = readForm(settings);
    try {
      await saveSettings(next);
      const stored = await getSettings();
      if (stored.sites.join(',') !== next.sites.join(',')) {
        throw new Error('список сайтов не сохранился');
      }
      settings = stored;
      fillForm(settings);
      $status.classList.remove('error');
      $status.textContent = `Сохранено · сайтов: ${settings.sites.length}`;
    } catch (e) {
      $status.classList.add('error');
      $status.textContent = `Не сохранилось: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
}

init();
