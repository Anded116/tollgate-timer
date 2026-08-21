import { browser } from 'wxt/browser';

// Типы WXT знают только служебные ключи (@@ui_locale и прочие), поэтому
// подпись ослаблена до обычной строки — ключи проверяются наличием в _locales.
const getMessage = browser.i18n.getMessage as unknown as (
  key: string,
  substitutions?: string | string[],
) => string;

export function t(key: string, subs?: string | string[]): string {
  return getMessage(key, subs);
}

/** Проставляет тексты в элементы с data-i18n. */
export function applyI18n(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  }
}
