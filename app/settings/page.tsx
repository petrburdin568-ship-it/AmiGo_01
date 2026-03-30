"use client";

import { AdminConsole } from "@/components/admin-console";
import { AppShell } from "@/components/app-shell";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();

  const copy =
    language === "ru"
      ? {
          title: "Настройки",
          intro: "Здесь управляются тема интерфейса и язык приложения.",
          themeLabel: "Тема оформления",
          themeText: `Сейчас включена ${theme === "light" ? "светлая" : "тёмная"} тема.`,
          themeAction: theme === "light" ? "Включить тёмную тему" : "Включить светлую тему",
          languageLabel: "Язык интерфейса",
          languageText: "Переключает основные экраны приложения между русским и английским.",
          russian: "Русский",
          english: "English"
        }
      : {
          title: "Settings",
          intro: "This screen controls the interface theme and app language.",
          themeLabel: "Theme",
          themeText: `The ${theme === "light" ? "light" : "dark"} theme is currently active.`,
          themeAction: theme === "light" ? "Enable dark theme" : "Enable light theme",
          languageLabel: "Interface language",
          languageText: "Switches the main app screens between Russian and English.",
          russian: "Russian",
          english: "English"
        };

  return (
    <AppShell mode="plain" title={copy.title} description="">
      <section className="reference-sheet stack-xl">
        <div className="reference-sheet-top">
          <span className="reference-brand-label">AmiGo</span>
        </div>

        <div className="screen-heading-row">
          <div className="stack-xs">
            <h1 className="reference-sheet-heading">{copy.title}</h1>
            <p className="reference-sheet-copy">{copy.intro}</p>
          </div>
        </div>

        <div className="reference-action-row settings-row">
          <div className="stack-xs">
            <div className="panel-title">{copy.themeLabel}</div>
            <p className="reference-sheet-copy">{copy.themeText}</p>
          </div>

          <button className="button button-primary" onClick={toggleTheme} type="button">
            {copy.themeAction}
          </button>
        </div>

        <div className="reference-action-row settings-row">
          <div className="stack-xs">
            <div className="panel-title">{copy.languageLabel}</div>
            <p className="reference-sheet-copy">{copy.languageText}</p>
          </div>

          <div className="settings-language-switch">
            <button
              className={`tag tag-selectable ${language === "ru" ? "tag-selected" : ""}`}
              onClick={() => setLanguage("ru")}
              type="button"
            >
              {copy.russian}
            </button>
            <button
              className={`tag tag-selectable ${language === "en" ? "tag-selected" : ""}`}
              onClick={() => setLanguage("en")}
              type="button"
            >
              {copy.english}
            </button>
          </div>
        </div>

        <AdminConsole />
      </section>
    </AppShell>
  );
}
