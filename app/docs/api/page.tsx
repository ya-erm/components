import type { Metadata } from "next";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "@/components/docs/CopyButton";
import { agentApi } from "@/lib/agent-api";
import { agentInstructions, apiBaseUrl, endpointTitles, guides } from "@/lib/api-documentation";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Документация API · Мои компоненты",
  description: "Полный справочник API компонентов: Bearer-токены, каталог, остатки, проекты, изображения, файлы, импорт и примеры запросов для агентов.",
};

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (node && typeof node === "object" && "props" in node)
    return textContent((node.props as { children?: ReactNode }).children);
  return "";
}

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    pre({ children }) {
      return <div className={styles.codeBlock}>
        <div className={styles.codeBar}><span>Пример запроса</span><CopyButton text={textContent(children).trimEnd()} /></div>
        <pre>{children}</pre>
      </div>;
    },
    table({ children }) { return <div className={styles.tableScroll}><table>{children}</table></div>; },
  }}>{children}</ReactMarkdown>;
}

const contractLabels: Record<string, string> = {
  body: "Тело запроса", query: "Параметры URL", headers: "Заголовки",
  response: "Ответ", semantics: "Правила изменения", purpose: "Назначение",
};

export default function ApiDocumentationPage() {
  const links = [...guides.map(({ id, title }) => ({ id, title })), { id: "endpoints", title: "Все методы API" }, { id: "models", title: "Модели и поля" }, { id: "agent", title: "Передать агенту" }];
  return (
    <div className={styles.docs}>
      <a className={styles.skip} href="#content">Перейти к документации</a>
      <header className={styles.header}>
        <a className={styles.brand} href="/components"><span aria-hidden="true" className={styles.logo}>C</span>Мои компоненты<span className={styles.brandDivider}>/</span><span className={styles.headerLabel}>Разработчикам</span></a>
        <a href="/settings">Выпустить токен <span aria-hidden="true">↗</span></a>
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarInner}>
            <p className={styles.navLabel}>Документация <span>v{agentApi.version}</span></p>
            <nav aria-label="Разделы документации">{links.map(({ id, title }, index) => <a href={`#${id}`} key={id}><span>{String(index + 1).padStart(2, "0")}</span>{title}</a>)}</nav>
            <div className={styles.formats}><p>Для инструментов и агентов</p><a href="/docs/api/markdown">Полный Markdown ↗</a><a href="/api/agent">JSON-справочник ↗</a></div>
            <p className={styles.publicNote}>Публичная документация.<br />Доступ к данным — по токену.</p>
          </div>
        </aside>
        <main id="content" className={styles.main}>
          <div className={styles.hero}>
            <div className={styles.kicker}><span /> API v{agentApi.version}<span className={styles.kickerDivider}>/</span>Для людей и агентов</div>
            <h1>Ваш каталог.<br /><span>Через API.</span></h1>
            <p className={styles.lead}>От поиска компонента до загрузки 3D-модели. Полный доступ к данным, понятные контракты и примеры, которые можно сразу использовать.</p>
            <div className={styles.heroActions}><a className={styles.primary} href="#quickstart">Начать работу <span aria-hidden="true">↓</span></a><a className={styles.secondary} href="#agent">Передать агенту ↗</a></div>
            <div className={styles.baseUrl}><span>BASE URL</span><code>{apiBaseUrl}</code><CopyButton text={apiBaseUrl} /></div>
            <div className={styles.stats}>
              <div><strong>{agentApi.endpoints.length}</strong><span>операции API</span></div>
              <div><strong>Bearer</strong><span>один токен для каталога</span></div>
              <div><strong>20 MiB</strong><span>на документ или 3D-модель</span></div>
            </div>
          </div>
          <div className={styles.mobileNav}><details><summary>Содержание документации</summary><nav aria-label="Разделы на мобильном устройстве">{links.map(({ id, title }) => <a key={id} href={`#${id}`}>{title}</a>)}</nav></details></div>
          {guides.map((section) => <section id={section.id} key={section.id} className={styles.section}>
            <p className={styles.eyebrow}>{section.eyebrow}</p><h2>{section.title}</h2>
            <div className={styles.prose}><Markdown>{section.content}</Markdown></div>
          </section>)}
          <section id="endpoints" className={styles.section}>
            <p className={styles.eyebrow}>09 · Reference</p><h2>Все методы API</h2>
            <p className={styles.sectionIntro}>Точные контракты из общего JSON-справочника. Все методы требуют токен или сессию, кроме GET /api/agent. Описания полей контракта приведены на английском, чтобы их можно было напрямую использовать в инструментах агента.</p>
            <div className={styles.endpointList}>{agentApi.endpoints.map((endpoint, index) => <article className={styles.endpoint} key={`${endpoint.method}:${endpoint.path}`} id={`endpoint-${index + 1}`}>
              <div className={styles.endpointHeading}><span className={styles.method} data-method={endpoint.method}>{endpoint.method}</span><code>{endpoint.path}</code></div>
              <h3>{endpointTitles[index]}</h3>
              <dl>{Object.entries(endpoint).filter(([key]) => !["method", "path"].includes(key)).map(([key, value]) => <div key={key}><dt>{contractLabels[key] ?? key}</dt><dd>{typeof value === "object" && value !== null ? <ul>{Object.entries(value).map(([field, description]) => <li key={field}><code>{field}</code><span>{String(description)}</span></li>)}</ul> : String(value)}</dd></div>)}</dl>
            </article>)}</div>
          </section>
          <section id="models" className={styles.section}>
            <p className={styles.eyebrow}>10 · Data dictionary</p><h2>Модели и поля</h2>
            <p className={styles.sectionIntro}>Все сохраняемые поля, типы и ограничения. optional и ? означают необязательное поле. ISO datetime — дата со временем и часовым поясом, например 2026-11-14T12:00:00.000Z. Значения enum передаются точно как указано.</p>
            <nav className={styles.modelLinks} aria-label="Модели данных">{Object.keys(agentApi.models).map((name) => <a key={name} href={`#model-${name}`}>{name}</a>)}</nav>
            {Object.entries(agentApi.models).map(([name, fields]) => <div id={`model-${name}`} key={name} className={styles.model}>
              <h3>{name}</h3><div className={styles.tableScroll}><table><thead><tr><th scope="col">Поле</th><th scope="col">Тип, ограничения и назначение</th></tr></thead><tbody>{Object.entries(fields).map(([field, description]) => <tr key={field}><th scope="row"><code>{field}</code></th><td>{String(description)}</td></tr>)}</tbody></table></div>
            </div>)}
          </section>
          <section id="agent" className={`${styles.section} ${styles.agentSection}`}>
            <p className={styles.eyebrow}>11 · Готово к работе</p><h2>Передать агенту</h2>
            <p>Скопируйте инструкцию и добавьте её к задаче. Токен предоставьте через окружение отдельно. Весь текст страницы доступен без входа и без выполнения JavaScript.</p>
            <div className={styles.agentPrompt}><pre>{agentInstructions}</pre><CopyButton text={agentInstructions} label="Скопировать инструкцию" /></div>
            <div className={styles.downloadLinks}><a href="/docs/api/markdown">Прочитать полный Markdown ↗</a><a href="/api/agent">Открыть JSON-справочник ↗</a></div>
          </section>
          <footer className={styles.footer}><span>Мои компоненты · API v{agentApi.version}</span><a href="#content">Наверх ↑</a></footer>
        </main>
      </div>
    </div>
  );
}
