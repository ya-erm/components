import { agentApi } from "./agent-api";

export const apiBaseUrl = "https://ya-components.vercel.app";
export const agentInstructions = `Документация API компонентов: ${apiBaseUrl}/docs/api/markdown
Прочитай её целиком до работы. JSON-справочник: ${apiBaseUrl}/api/agent.
Используй Bearer-токен из предоставленного окружения, не показывай его в ответах и логах.
Перед изменением прочитай актуальную запись. Для PATCH передавай If-Match из GET.
Массивы заменяются целиком: сохраняй существующие элементы и их id.
При 409 перечитай запись и пересобери изменение. Не придумывай неизвестные значения.
Изображения добавляй в images, документы и 3D-модели — в attachments; изображения не дублируй как файлы.`;

const code = (language: string, value: string) => `\n\n\`\`\`${language}\n${value}\n\`\`\`\n`;

export const guides = [
  {
    id: "quickstart", title: "Быстрый старт", eyebrow: "01 · Подключение",
    content: `API работает с тем же каталогом, что и сайт: компоненты, закупки, остатки, проекты, заказы, комментарии, фотографии и файлы. Базовый URL: **${apiBaseUrl}**. Все пути ниже относительны этому адресу. Формат запросов и ответов — JSON, кроме явно указанных загрузок и скачиваний.

1. Войдите на сайт и откройте [Настройки → Доступ для агентов](/settings).
2. Выпустите токен с понятным названием, скопируйте его сразу и сохраните в переменную окружения \`COMPONENTS_TOKEN\`.
3. Передайте агенту ссылку на эту страницу или [полный Markdown](/docs/api/markdown) и доступ к переменной окружения.
4. Проверьте чтение каталога. В примерах используется curl; для разбора JSON в shell также нужен jq.
${code("bash", `export COMPONENTS_URL="${apiBaseUrl}"
# COMPONENTS_TOKEN задайте в окружении, не сохраняйте его в коде.
curl --fail-with-body "$COMPONENTS_URL/api/components?q=ST7735&all=1" \\
  -H "Authorization: Bearer $COMPONENTS_TOKEN"`)}
Ответ списка содержит \`items\`, \`total\`, \`page\`, \`pageSize\`. Каждая запись: \`{id, createdAt, updatedAt, data}\`. Все пользовательские поля лежат внутри \`data\`. Пустой каталог — успешный ответ с пустым \`items\`.

### Создать компонент
${code("bash", `curl --fail-with-body "$COMPONENTS_URL/api/components" \\
  -H "Authorization: Bearer $COMPONENTS_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data '{"data":{"name":"ST7735","type":"Дисплей","tags":["SPI"],"purchases":[],"usages":[]}}'`)}
Успех: **201**, полная запись с выданным сервером \`id\`. Примеры на странице содержат вымышленные данные; подставляйте реальные идентификаторы из вашего каталога.`,
  },
  {
    id: "authentication", title: "Токены и доступ", eyebrow: "02 · Авторизация",
    content: `Каждый запрос к данным требует заголовок \`Authorization: Bearer <token>\`. Токен даёт полный доступ на чтение, запись и удаление **только каталога его владельца**. Отдельных read-only токенов и настраиваемых scopes сейчас нет.

- Срок действия: от 1 до 365 дней, по умолчанию 90. До 50 активных токенов.
- Полный секрет показывается один раз; сервер хранит его хеш. Утерянный токен нужно заменить новым.
- Отзыв в настройках действует для следующих API-запросов сразу. Уже выданные подписанные ссылки на файлы действуют до конца своего короткого срока.
- Неверный, истёкший или отозванный Bearer возвращает **401 JSON**, даже если браузерная сессия действительна.
- Не помещайте токен в URL, публичные документы, исходный код или логи. Передавайте его только серверу приложения; хранилищу файлов он не нужен.

### Что доступно без входа
Эта HTML-страница, [Markdown](/docs/api/markdown) и [JSON-справочник](/api/agent). Они не содержат пользовательских данных. Остальные API проверяют сессию или токен.

### Управление токенами
Выпуск и отзыв доступны **только через браузерную сессию владельца**, агент не может выпустить себе новый токен. Интерфейс настроек использует \`GET /api/settings/tokens\`, \`POST /api/settings/tokens\` с \`{name, expiresInDays}\` и \`DELETE /api/settings/tokens?id=…\`. Для POST/DELETE требуется Origin сайта; Authorization в этих маршрутах не допускается.`,
  },
  {
    id: "editing", title: "Поиск и безопасное редактирование", eyebrow: "03 · Компоненты",
    content: `\`GET /api/components\` поддерживает \`q\` (включая связанные заказы, треки и проекты), точные \`type\` и \`tag\`, фильтр \`status\`, \`page\` (от 1, по 50 записей) и \`all=1\`. Параметры можно сочетать; значения кодируйте как URL-параметры. Доступные типы и теги с количеством записей возвращает \`GET /api/components/facets\`.

Статусы фильтра: \`in_stock\` — в наличии, \`in_transit\` — в пути, \`planned\` — запланировано, \`used\` — использовано, \`unassigned\` — не распределено, \`out_of_stock\` — нет в наличии.

### PATCH: сначала прочитать, затем изменить
\`PATCH\` меняет только переданные поля \`data\`. **Массив заменяется целиком**, а не дополняется: это относится к images, attachments, purchases, usages, comments, tags, inventory и history. Чтобы добавить элемент, прочитайте запись, сохраните старые элементы и их ID, добавьте новый и отправьте весь массив. \`[]\` очищает коллекцию, \`""\` очищает необязательное текстовое поле. Неизвестные поля PATCH отклоняются.

GET одной записи возвращает \`ETag\`. Передавайте его без изменений в \`If-Match\` при PATCH, включая кавычки и возможный префикс \`W/\`. При **409** получите запись заново и заново примените намерение к актуальным данным; не повторяйте старый массив вслепую. Пример добавления комментария (Python 3, пакет requests):
${code("python", `import os, uuid
from datetime import datetime, timezone
import requests

base = os.environ.get("COMPONENTS_URL", "${apiBaseUrl}")
headers = {"Authorization": "Bearer " + os.environ["COMPONENTS_TOKEN"]}
component_id = "REPLACE_WITH_COMPONENT_ID"
url = f"{base}/api/components/{component_id}"
response = requests.get(url, headers=headers, timeout=30)
response.raise_for_status()
item = response.json()
comment = {"id": str(uuid.uuid4()), "text": "Проверено, хранится в коробке 3",
           "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
response = requests.patch(url,
    headers={**headers, "If-Match": response.headers["ETag"]},
    json={"data": {"comments": [*item["data"].get("comments", []), comment]}},
    timeout=30)
if response.status_code == 409:
    raise RuntimeError("Запись изменилась: перечитайте её и пересоберите массив")
response.raise_for_status()`)}
\`PUT /api/components/{id}\` заменяет все данные, включая массивы; для частичных изменений используйте PATCH. \`DELETE\` удаляет запись и возвращает \`{ok:true}\`. If-Match проверяется только PATCH; PUT и DELETE не предоставляют такой защиты. POST создания не имеет ключа идемпотентности: после сетевого сбоя сначала проверьте, появилась ли запись.`,
  },
  {
    id: "inventory", title: "Закупки, остатки и связи", eyebrow: "04 · Учёт",
    content: `Текущая модель учёта — \`purchases\` (закупки) и \`usages\` (расход в проектах). \`inventory\`, \`history\`, \`quantity\` и \`status\` компонента относятся к старому формату; сохраняйте архивные данные при чтении, но для изменения остатков используйте закупки и расходы.

**Доступно = сумма полученных закупок (delivered) − сумма расходов.** Закупки planned, in_transit, cancelled и unassigned не добавляют доступный остаток. Для получения измените статус существующей закупки на \`delivered\`, сохранив её ID. Для расхода добавьте \`Usage\` с \`projectId\` и количеством.

Пропущенное \`quantity\` означает **неизвестное количество**, а \`0\` — известный ноль. Не подставляйте ноль вместо неизвестного. Сервер проверяет известные остатки и связи; при неизвестных количествах возможна неполная оценка наличия.

### Связанные сущности
\`GET /api/logistics\` возвращает orders, shipments и projects. \`PATCH /api/logistics\` добавляет или обновляет переданные записи по ID, сохраняя остальные; каждая переданная запись заменяется целиком. То же поле \`logistics\` можно передать вместе с созданием/изменением компонента: сущности и ссылки проверяются атомарно.

У закупки должен существовать \`orderId\`, у расхода — \`projectId\`. Для новых вложенных сущностей генерируйте стабильные UUID; не меняйте ID существующих элементов. Пара source + number у заказа, названия проектов и номера отслеживания посылок уникальны без учёта регистра.

Ниже — тело PATCH для **пустого** компонента: создать заказ и учесть пять полученных модулей. Для существующего компонента добавьте закупку к прочитанному массиву и используйте If-Match.
${code("json", JSON.stringify(agentApi.examples.receive.body, null, 2))}
Импортированную метаинформацию \`importState\` сохраняйте. Если вручную меняете импортированные quantity/status и хотите защитить их от следующего импорта, добавьте соответствующие имена полей в \`importState.manualFields\`.`,
  },
  {
    id: "media", title: "Изображения и файлы", eyebrow: "05 · Материалы",
    content: `Есть два отдельных способа прикрепить материалы. Загрузка сама по себе не меняет компонент: после неё сохраните ссылку или метаданные в записи.

| Материал | Куда сохранять | Ограничения |
| --- | --- | --- |
| Фотография, схема, распиновка, чертёж как картинка | data.images | До 10 изображений; PNG, JPEG, WebP, GIF, AVIF |
| PDF, STEP, STL, ZIP и другие документы/модели | data.attachments | До 30 файлов; каждый от 1 до 20 971 520 байт (20 MiB) |

Изображения загружаются в публичное хранилище; файлы скачиваются с проверкой владельца по временной подписанной ссылке. Изображения прикладывайте **только как изображения**, не дублируйте в attachments. Первая картинка в images — основная.

### Изображение → галерея
Отправляйте по одному изображению; multipart-тело должно помещаться в лимит хостинга около 4,5 МБ, поэтому оставляйте запас для служебных полей.
${code("bash", `curl --fail-with-body "$COMPONENTS_URL/api/upload" \\
  -H "Authorization: Bearer $COMPONENTS_TOKEN" \\
  -F "files=@pinout.png"`)}
Ответ \`{urls:["https://…"]}\`: добавьте URL к актуальному массиву \`data.images\` через PATCH с If-Match. Для скачивания через API есть \`GET /api/images/download?url=…\`; разрешён адрес на настроенном хранилище, принадлежащий вам или упомянутый в вашем каталоге.

### Файл → разрешение → хранилище → компонент
1. \`POST /api/files\` с JSON \`{name,size,contentType?}\` возвращает **201**: attachment и upload (url, method, headers), expiresIn = 300 секунд.
2. Отправьте **сырые байты** PUT-запросом на upload.url с upload.headers. Content-Length должен совпасть с size. Не добавляйте Bearer и cookies приложения. Проверьте успешный ответ хранилища.
3. Прочитайте компонент, добавьте attachment к его массиву attachments и сохраните через PATCH + If-Match. При 409 пересоберите массив; повторная загрузка файла не нужна.

Полный пример загрузки модели (Python 3 + requests; файл model.step рядом со скриптом):
${code("python", `import os, mimetypes
from pathlib import Path
import requests

base = os.environ.get("COMPONENTS_URL", "${apiBaseUrl}")
headers = {"Authorization": "Bearer " + os.environ["COMPONENTS_TOKEN"]}
component_id = "REPLACE_WITH_COMPONENT_ID"
file = Path("model.step")
response = requests.post(base + "/api/files", headers=headers, json={
    "name": file.name, "size": file.stat().st_size,
    "contentType": mimetypes.guess_type(file.name)[0] or "application/octet-stream"
}, timeout=30)
response.raise_for_status()
permit = response.json()
# Отдельный запрос без сессии приложения и без Bearer.
with file.open("rb") as body:
    uploaded = requests.put(permit["upload"]["url"],
        headers=permit["upload"]["headers"], data=body, timeout=120)
    uploaded.raise_for_status()
url = f"{base}/api/components/{component_id}"
current = requests.get(url, headers=headers, timeout=30)
current.raise_for_status()
attachments = current.json()["data"].get("attachments", [])
saved = requests.patch(url,
    headers={**headers, "If-Match": current.headers["ETag"]},
    json={"data": {"attachments": [*attachments, permit["attachment"]]}}, timeout=30)
if saved.status_code == 409:
    raise RuntimeError("Перечитайте компонент и добавьте permit['attachment'] заново")
saved.raise_for_status()`)}
Старый multipart \`POST /api/files\` с полем \`file\` принимает только файлы до **4 MiB** и возвращает Attachment напрямую. Для всех размеров до 20 MiB предпочитайте JSON + прямой PUT.

### Скачать или открепить
\`GET /api/files/{id}\` с Bearer возвращает **307** и Location — подписанный URL на 60 секунд. Пройдите по Location отдельным запросом **без Authorization**; не используйте curl --location-trusted. Ссылка временно даёт доступ к файлу, не публикуйте её.

Чтобы открепить материал, удалите его из соответствующего массива и сохраните PATCH с If-Match. Отдельного DELETE файлов нет: байты сохраняются для других ссылок и отменённых правок. Экспорт содержит метаданные и ссылки, а не содержимое файлов; перенос JSON к другому владельцу не переносит права на файлы.`,
  },
  {
    id: "projects", title: "Проекты и порядок", eyebrow: "06 · Организация",
    content: `\`GET /api/projects\` возвращает проекты в порядке отображения. \`POST /api/projects\` создаёт проект с серверным UUID; тело: \`{name,description?,images?}\`. В описании можно хранить Markdown. \`PUT /api/projects/{id}\` заменяет детали проекта, сохраняя порядок компонентов; сначала прочитайте проект, чтобы сохранить нужные поля.

\`GET /api/projects/{id}\` возвращает \`{project,components,version}\`. Компоненты уже упорядочены для этого проекта. Чтобы заменить состав проекта и расход компонентов, передайте \`version\` как \`expected\`:
${code("json", JSON.stringify({ components: [{ id: "COMPONENT_ID", quantity: 2 }], expected: "VERSION_FROM_GET" }, null, 2))}
Тело предназначено для \`PUT /api/projects/{id}/components\`. Выборка заменяется целиком: \`components:[]\` убирает все расходы проекта. Расходы других проектов сохраняются; сервер проверяет остатки. При 409 получите новую версию и пересоберите выборку.

\`PATCH /api/projects/order\` принимает \`{ids:[…]}\` со **всеми** текущими проектами, каждый ID ровно один раз. \`PUT /api/projects/{id}/order\` принимает все текущие ID компонентов проекта по тому же правилу. Отдельного DELETE проекта сейчас нет.`,
  },
  {
    id: "imports", title: "Экспорт и импорт", eyebrow: "07 · Перенос данных",
    content: `\`GET /api/components/export\` возвращает полный JSON каталога: \`version:2\`, exportedAt, count, components (id + data), orders, shipments, projects и возможное legacyIgnoredOrders. Включает комментарии, историю, метаданные импорта и материалы, но **не бинарные файлы**.

\`POST /api/components/import\` принимает экспорт версии 1/2, массив \`{id?,data}\` или массив ComponentData. До 5000 записей; запрос также должен помещаться в лимит тела хостинга. Обновляет совпадающие ID, создаёт отсутствующие, генерирует пропущенные ID, не удаляет отсутствующие в файле записи. Некорректные компоненты пропускаются: обязательно проверьте \`{created,updated,skipped,total}\`. Ошибка связей может отклонить весь запрос. Импорт заменяет данные совпавших компонентов; предварительно сохраните экспорт.
${code("bash", `curl --fail-with-body "$COMPONENTS_URL/api/components/export" \\
  -H "Authorization: Bearer $COMPONENTS_TOKEN" -o catalog.json

curl --fail-with-body "$COMPONENTS_URL/api/components/import" \\
  -H "Authorization: Bearer $COMPONENTS_TOKEN" \\
  -H "Content-Type: application/json" --data-binary @catalog.json`)}
### AliExpress: analyze → preview → apply
\`POST /api/components/aliexpress\` принимает \`{action,data,selections?,token?}\`, где data — AliExport. Это импорт подготовленного JSON, а не загрузка произвольной страницы магазина. Размер запроса — до 4 MiB.

1. **analyze**: отправьте data; получите строки rows, текущие components и logistics. Используйте ID строк из ответа как selections[].rowId.
2. **preview**: отправьте те же data и выбранные selections. Проверьте показанные изменения и сохраните token из ответа.
3. **apply**: отправьте идентичные data/selections и этот token. Если каталог изменился — 409: повторите анализ/preview.

Selection может указать существующие componentId/purchaseId или данные нового компонента через name/componentDraft, unitsPerPack, quantity и status. Не подменяйте неизвестные количества. Данные входного формата и вложенных записей перечислены ниже в моделях AliExport, AliOrder, AliItem, AliSelection.

\`ackImportPreferences\` с preferences: [{source,id}] подтверждает миграцию старых правил игнорирования (поле data также обязательно). Текущие черновики и правила игнорирования UI хранятся в браузере; API не даёт доступа к localStorage другого клиента. Агент может вести свои правила локально.`,
  },
  {
    id: "errors", title: "Ошибки и повторные запросы", eyebrow: "08 · Надёжность",
    content: `При ошибке приложение обычно возвращает \`{error:"…",issues?:…}\`. Не определяйте успех только по наличию JSON — проверяйте HTTP-статус. Хостинг/хранилище могут вернуть текст или XML вместо JSON.

| Код | Что делать |
| --- | --- |
| 400 | Исправьте JSON, типы, лимиты полей, ссылки или количество. Подробности в error и иногда issues. |
| 401 | Проверьте Bearer и срок действия. Владелец должен выпустить/заменить токен в настройках. |
| 403 | Проверьте разрешение на картинку или подпись хранилища: срок, ключ, размер и заголовки. |
| 404 | Запись отсутствует в каталоге владельца токена; проверьте ID. |
| 409 | Конфликт версии. Перечитайте запись/проект, пересоберите изменение; AliExpress требует новый preview. |
| 413 | Уменьшите тело запроса. Для файлов используйте прямую загрузку до 20 MiB. |
| 500 / сетевой сбой | Чтение можно повторить с задержкой. Перед повторной записью проверьте результат: запрос мог уже сохраниться. |

Изменения каталога проверяются атомарно; конкурирующие записи повторяются сервером на свежих данных. Это не заменяет If-Match для массивов, ожидаемую версию проекта и preview-токен AliExpress. Общего idempotency-key и транзакции на несколько HTTP-запросов нет. Для файлов действуют отдельные краткоживущие разрешения.`,
  },
] as const;

export const endpointTitles = [
  "Машиночитаемый справочник", "Найти и получить компоненты", "Создать компонент",
  "Прочитать компонент", "Изменить отдельные поля", "Заменить все данные компонента",
  "Удалить компонент", "Получить типы и теги", "Получить проекты", "Создать проект",
  "Прочитать проект и его компоненты", "Обновить детали проекта", "Изменить порядок проектов",
  "Изменить порядок компонентов проекта", "Заменить состав проекта", "Загрузить файл",
  "Скачать приватный файл", "Получить связанные сущности", "Обновить связанные сущности",
  "Экспортировать каталог", "Импортировать каталог", "Загрузить изображения",
  "Скачать изображение", "Импортировать заказы AliExpress",
];

function describe(value: unknown): string {
  if (typeof value === "object" && value !== null)
    return Object.entries(value).map(([key, detail]) => `- \`${key}\`: ${detail}`).join("\n");
  return String(value);
}

export function apiDocumentationMarkdown() {
  return [
    `# Компоненты · API\n\nПолная документация для людей и агентов. API v${agentApi.version}.\n\nBase URL: ${apiBaseUrl}\n\nHTML: ${apiBaseUrl}/docs/api\nJSON: ${apiBaseUrl}/api/agent`,
    ...guides.map((section) => `## ${section.title}\n\n${section.content}`),
    "## Все методы API\n\nВсе методы требуют Bearer или сессию, кроме GET /api/agent.",
    ...agentApi.endpoints.map((endpoint, index) => `### ${endpoint.method} ${endpoint.path} — ${endpointTitles[index]}\n\n` + Object.entries(endpoint).filter(([key]) => !["method", "path"].includes(key)).map(([key, value]) => `**${key}**\n\n${describe(value)}`).join("\n\n")),
    "## Модели и ограничения полей\n\n? и optional означают необязательное поле. ISO datetime — строка с часовым поясом, например 2026-11-14T12:00:00.000Z. Идентификаторы — строки, сохраняйте их при изменении.",
    ...Object.entries(agentApi.models).map(([name, fields]) => `### ${name}\n\n${describe(fields)}`),
    `## Инструкция для агента\n\n${agentInstructions}`,
  ].join("\n\n");
}
