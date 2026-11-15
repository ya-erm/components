# Задача агенту WebCAD: встроенный просмотр моделей для сайта компонентов

Репозиторий CAD: `~/Code/cad`, production: https://cad.ya-erm.ru (GitHub Pages).
Добавить и задеплоить первый этап интеграции: просмотр STEP/STP, STL и
`.webcad.json` во встроенном iframe. Родительская сторона реализуется в
`~/Code/components`; контракт ниже — WebCAD Embed Protocol v1.

## URL и доверенные отправители

Маршрут: `https://cad.ya-erm.ru/#/embed?parentOrigin=<encoded origin>&channel=<uuid>`.
`parentOrigin` и `channel` читать из query **внутри hash**, не из location.search.
Разрешённые production origins:

- https://ya-components.vercel.app
- https://components-yaerms-projects.vercel.app
- https://components-git-main-yaerms-projects.vercel.app

localhost / 127.0.0.1 разрешать только в dev-режиме. Проверять origin по точному
списку, не через endsWith и не принимать произвольный origin из URL на доверие.
Все postMessage отправлять с точным targetOrigin, никогда `*`.
Входящие сообщения: event.source === window.parent, event.origin === разрешённый
parentOrigin, data.version === 1, data.channel === channel; валидировать payload.
Не разрешать в embed произвольные команды window.webcad / Agent API.

## Обмен сообщениями

Все сообщения — обычные объекты. После установки обработчика и готовности принять
файл iframe отправляет родителю:

```ts
{ type: "webcad:ready", version: 1, channel: string }
```

Родитель после ready скачивает выбранное вложение своим авторизованным механизмом
и отправляет файл. ArrayBuffer передаётся через transfer list:

```ts
{
  type: "webcad:load", version: 1, channel: string,
  requestId: string, // UUID одной попытки загрузки
  file: {
    name: string,
    format: "step" | "stl" | "webcad", // .stp также step
    size: number, // 1..20971520 байт
    buffer: ArrayBuffer // byteLength === size
  }
}
```

Не обращаться за файлом по сети из iframe: URL хранилища, токены и cookies
приложения WebCAD не получает. Проверять размер до разбора. Обрабатывать только
одну загрузку одновременно, повтор того же requestId не должен дублировать модель.

Пока файл открывается, iframe может сообщать этап (необязательно; родитель, который
его не знает, сообщение игнорирует). Каждый этап — не больше одного раза и только
до ответа на этот requestId:

```ts
{
  type: "webcad:progress", version: 1, channel: string, requestId: string,
  stage: "kernel" | "building", // kernel — ещё грузится геометрическое ядро (первый запуск)
  message: string               // для людей, на языке интерфейса WebCAD
}
```

Процента у этих этапов нет. Процент показывает сам родитель — для скачивания
файла (передача через postMessage с transfer list мгновенна).

Когда модель построена и реально видна (камера fit-to-model), отправить:

```ts
{ type: "webcad:loaded", version: 1, channel: string, requestId: string }
```

При ошибке разбора / построения:

```ts
{
  type: "webcad:error", version: 1, channel: string, requestId: string,
  error: { code: string, message: string }
}
```

Коды можно использовать INVALID_FILE, UNSUPPORTED_FORMAT, BUILD_FAILED.
Сообщение должно быть пригодным для человека, без содержимого файла и секретов.
Родитель ждёт ready 30 секунд и loaded 120 секунд, предлагает повторную попытку
(новый iframe / channel / requestId) или скачивание исходника при ошибке.

## Поведение просмотрщика

- Отдельный лёгкий UI без дерева редактирования и списка пользовательских документов.
- Вращение, панорамирование, масштаб, стандартные виды и «Показать целиком».
- Сохранять единицы модели и пропорции; в webcad поддерживать вкладки Part Studio
  и сборок, выбор вкладки при нескольких. Объяснять пустую/неподдерживаемую сцену.
- STEP/STL открывать как временную модель, webcad разбирать существующим
  readProject, показывать через существующее ядро и viewport.
- Только просмотр: без автосохранения, записи IndexedDB, изменений существующих
  документов/рабочих пространств/версий, обращения к ранее выбранным папкам.
  Не запускать обычные startup-эффекты сохранения редактора в embed.
- Освобождать Worker/WebGL и ссылки на большие буферы при закрытии/смене модели.
- Ошибки ядра перехватывать; iframe не должен бесконечно показывать спиннер.
- Интерфейс должен помещаться на телефоне и в iframe с sandbox="allow-scripts
  allow-same-origin". Загрузка геометрии в Worker остаётся локальной в браузере.
- Первый этап не включает редактирование, сохранение обратно и импорт в библиотеку.

## Проверка и публикация

1. Добавить тесты сообщений: неправильный origin/source/channel/version, неверный
   формат, размер/byteLength, повтор requestId и повреждённые файлы.
2. Проверить настоящие STEP, бинарный/ASCII STL и `.webcad.json` (в том числе сборку).
   Loaded отправляется после отображения, не сразу после JSON.parse.
3. Проверить, что обычный CAD и документы в IndexedDB не затронуты просмотром.
4. Типы, тесты, build, повышение версии и справка RU/EN — по AGENTS.md WebCAD.
5. Задеплоить на GitHub Pages, дождаться успешного workflow; проверить production
   iframe с https://ya-components.vercel.app. Сообщить commit и результат проверки.

Сайт компонентов скачивает вложение после ready и передаёт его по этому контракту.
API-токен для такой интеграции пользователю выпускать не нужно: используется
уже открытая сессия сайта компонентов. Приватность файлов сохраняется.
