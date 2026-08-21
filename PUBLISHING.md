# Публикация Tollgate Timer

Публикуется пока только Firefox-версия (AMO). Сборка под Chrome в проекте
поддерживается, тексты для Chrome Web Store — в конце файла, на будущее.

## Артефакты

| Файл | Куда |
| --- | --- |
| `.output/tollgate-timer-1.0.0-firefox.zip` | AMO — сам аддон |
| `.output/tollgate-timer-1.0.0-sources.zip` | AMO — исходники, если ревью попросит |
| `assets-store/icon-512.png` | иконка листинга |
| `assets-store/screenshot-1-gate.png` | скриншот 1280×800 — экран таймера |
| `assets-store/screenshot-2-popup.png` | скриншот 1280×800 — попап |
| `assets-store/screenshot-3-options.png` | скриншот 1280×800 — настройки |

Собрать заново: `npm run zip:firefox`.

## Тексты листинга

**Название:** Tollgate Timer

**Короткое описание (до 132 симв.):**
Вход на залипательные сайты платный, и платишь ты временем: чем чаще заходишь, тем дольше ждёшь.

**Полное описание:**

```
Реддит, ютуб и твиттер работают как лутбоксы: по клику ты либо получаешь дофамин,
либо нет. Из-за этого вырабатывается привычка заходить на сайт десятки раз в день.

Tollgate Timer не блокирует сайты — он ставит перед входом шлагбаум, проезд через
который оплачивается временем. И чем чаще ты заходишь, тем дороже проезд. Пара
заходов в день проходит свободно. К десятому заходу перед сайтом стоит долгий
таймер, и обычно проще передумать.

Как это работает:
• Первые заходы за день — без задержки вообще.
• Дальше перед входом появляется экран с заполняющимся кругом, и каждый следующий
  заход дороже предыдущего, вплоть до потолка (по умолчанию 10 минут).
• Круг заполняется только пока вкладка видима и в фокусе — «открыть и подождать в
  фоне» не сработает.
• Счётчик заходов тает сам по себе, поэтому утро начинается почти с чистого листа,
  а вечерний перебор ещё чувствуется ночью. Никаких сбросов в полночь, которых
  можно дождаться.
• Кнопка «Передумал» закрывает вкладку мгновенно: правильное решение бесплатно.
• Сайт не начинает загружаться, пока таймер не истёк — лента не успевает
  подсунуть первую порцию.

Настраивается целиком: три пресета строгости, число бесплатных заходов, базовая
задержка, множитель роста, потолок, скорость распада счётчика, длительность
сессии, свой список сайтов и режим общего счётчика на все сайты сразу.

Расширение не собирает данные и никуда ничего не отправляет: счётчики заходов и
настройки хранятся только в браузере.
```

**Теги:** focus, productivity, timer, distraction

**Языки интерфейса** (AMO показывает их в листинге): en, ru, de, fr, es, it, pl,
pt-BR, ja. Описание аддона в `about:addons` тоже локализовано.

## Ответы про данные (AMO спрашивает при загрузке)

- Персональные данные не собираются, не передаются и не продаются.
- Аналитики, телеметрии, внешних запросов нет — расширение полностью офлайн.
- Хранится локально: список сайтов, параметры таймера, таймстемпы заходов.
- Удалённого кода нет, весь JS внутри пакета.
- В манифесте объявлено `data_collection_permissions: required: ["none"]`.

**Зачем нужны разрешения** (пригодится в поле для ревьюера):
- `webNavigation` — узнать о начале перехода на сайт из списка и увести вкладку
  на экран таймера ДО загрузки сайта.
- `tabs` — прочитать URL вкладок, чтобы отличить вход на сайт от навигации внутри
  него, и `tabs.update`, чтобы показать экран таймера.
- `storage` — локальное хранение настроек и таймстемпов заходов.
- Host permissions не запрашиваются: контент-скриптов нет, страницы не читаются
  и не изменяются.

## Notes to Reviewer (вставить как есть)

```
WHAT IT DOES
Delays entry to user-listed websites with a timer whose length grows with visit
frequency. No content scripts, no page modification, no network requests.

PERMISSIONS
- webNavigation: detect navigation to a listed site and redirect the tab to the
  extension's own page (gate.html) before the site loads.
- tabs: read tab URLs to tell "entering the site" from "navigating inside it",
  and tabs.update to show that page.
- storage: keep settings and visit timestamps locally (storage.local).
No host permissions are requested.

HOW TO TEST (fastest path)
1. Open the add-on's options page.
2. Set "Free visits" to 0 and press "Save" — the confirmation next to the button
   must turn green.
3. Close any existing reddit.com tabs, then open https://reddit.com in a new tab:
   the timer page appears instead of the site.
4. The circle advances only while the tab is focused — switch to another tab and
   back to see it pause and resume.
5. When it completes, "Enter" becomes active and loads the site; "Changed my mind"
   closes the tab.
Note: navigation is intentionally free while the site is already open in the same tab.

BUILD INSTRUCTIONS (source archive provided)
The uploaded package is bundled and minified by WXT (Vite). To reproduce:
  Node.js 22 or newer (built with 23.6.0), npm 11
  npm ci
  npm run build:firefox
The result appears in .output/firefox-mv2/ and matches the uploaded package.
Source archive: tollgate-timer-1.0.0-sources.zip (includes package-lock.json).

LOCALIZATION
UI strings live in _locales/<locale>/messages.json (en, ru, de, fr, es, it, pl,
pt_BR, ja); the interface follows the browser language, English is the default.
```

## Порядок публикации на AMO

1. [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) → Submit a New Add-on.
2. Выбрать способ распространения:
   - **On this site** — публичный листинг, автообновления, проходит ревью;
   - **On your own** — подписанный XPI без листинга, ставится вручную.
3. Загрузить `tollgate-timer-1.0.0-firefox.zip`, дождаться валидации.
4. Заполнить листинг текстами выше, добавить иконку и скриншоты.
5. Ответить на вопросы про данные (ответы выше) и отправить.

Всё бесплатно: ни взноса разработчика, ни платы за подпись. Подпись обязательна —
неподписанный XPI постоянно не установится ни в Firefox, ни в Zen.

## При обновлении версии

1. Поднять `version` в `package.json`.
2. `npm run zip:firefox`.
3. Загрузить новый архив как новую версию. Номер должен строго расти.

`browser_specific_settings.gecko.id` (`tollgate@kolombet.dev`) менять нельзя — это
постоянная идентичность аддона в Firefox, к ней привязано хранилище пользователя.

## Chrome Web Store — когда дойдёт очередь

Регистрация разработчика $5 единоразово. `npm run zip` → Developer Dashboard →
New item. Тексты листинга те же. Chrome дополнительно требует обоснования по
каждому разрешению (см. выше) и заявление о single purpose: «задержка перед
входом на сайты из списка пользователя».
