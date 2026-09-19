import { useMemo } from "react";
import { BookOpenText, LifeBuoy, ListTree } from "lucide-react";
import { HELP_PAGE_MAP } from "./helpContent";
import { HELP_NAV_CHILDREN, type HelpPageId } from "./helpModuleDefinitions";

const HELP_URL_PATTERN = /(https?:\/\/[^\s,;]+)/g;

function renderHelpText(text: string) {
  return text.split(HELP_URL_PATTERN).map((part, index) =>
    part.startsWith("http://") || part.startsWith("https://") ? (
      <a
        key={`${part}-${index}`}
        className="help-page__link"
        href={part}
        target="_blank"
        rel="noreferrer"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

interface HelpModuleProps {
  activePage: HelpPageId;
  onNavigate: (pageId: HelpPageId) => void;
}

export function HelpModule({ activePage, onNavigate }: HelpModuleProps) {
  const page = useMemo(() => HELP_PAGE_MAP.get(activePage), [activePage]);
  const isOverviewPage = activePage === "help-overview";

  if (!page) {
    return null;
  }

  return (
    <section className="module-page help-page">
      <div className="module-page__hero">
        <div className="module-page__hero-copy">
          <h1>{page.title}</h1>
          <p>{page.summary}</p>
        </div>
      </div>

      {isOverviewPage ? (
        <>
          <div className="help-page__intro-grid">
            <section className="module-note-card help-page__intro-card">
              <div className="module-note-card__head">
                <BookOpenText size={18} />
                <div>
                  <h3>Desktop Help Scope</h3>
                  <p>
                    This help system explains the current desktop client behavior. Use the web
                    reference for broader RNAmeta project context and online presentation material.
                  </p>
                </div>
              </div>
            </section>

            <section className="module-note-card help-page__intro-card">
              <div className="module-note-card__head">
                <LifeBuoy size={18} />
                <div>
                  <h3>How To Read This Guide</h3>
                  <p>
                    Start with Overview and Getting Started if you are new to the workflow, then
                    move into the module-specific pages that match your current analysis task.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <section className="config-card help-page__toc-card">
            <div className="config-card__head">
              <div className="config-card__icon">
                <ListTree size={18} />
              </div>
              <div className="config-card__copy">
                <h3>Help Navigation</h3>
                <p>Switch between detailed help pages without leaving the desktop workflow.</p>
              </div>
            </div>

            <div className="help-page__toc-grid">
              {HELP_NAV_CHILDREN.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`help-page__toc-item${item.id === activePage ? " is-active" : ""}`}
                  onClick={() => onNavigate(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{HELP_PAGE_MAP.get(item.id)?.summary ?? ""}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <div className="help-page__section-stack">
        {page.sections.map((section) => (
          <section key={section.title} className="config-card help-page__section-card">
            <div className="config-card__head">
              <div className="config-card__icon">
                <BookOpenText size={18} />
              </div>
              <div className="config-card__copy">
                <h3>{section.title}</h3>
                <p>Detailed guidance for the current RNAmeta Desktop help topic.</p>
              </div>
            </div>

            <div className="help-page__prose">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{renderHelpText(paragraph)}</p>
              ))}
            </div>

            {section.lists?.length ? (
              <div className="help-page__list-grid">
                {section.lists.map((list) => (
                  <div key={list.label} className="help-page__list-card">
                    <strong>{list.label}</strong>
                    <ul>
                      {list.items.map((item) => (
                        <li key={item}>{renderHelpText(item)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </section>
  );
}
