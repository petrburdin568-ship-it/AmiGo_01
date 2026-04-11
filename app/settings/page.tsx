"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { AdminConsole } from "@/components/admin-console";
import { AppShell } from "@/components/app-shell";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import {
  BUILT_IN_CALL_RINGTONES,
  deleteCustomCallRingtone,
  getStoredCallRingtoneChoice,
  getStoredCustomCallRingtoneName,
  hasCustomCallRingtone,
  saveCustomCallRingtone,
  setStoredCallRingtoneChoice,
  type CallRingtoneChoice
} from "@/lib/call-ringtone";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const customRingtoneInputRef = useRef<HTMLInputElement | null>(null);
  const [ringtoneChoice, setRingtoneChoice] = useState<CallRingtoneChoice>(() => getStoredCallRingtoneChoice());
  const [hasCustomRingtoneOption, setHasCustomRingtoneOption] = useState(false);
  const [customRingtoneName, setCustomRingtoneName] = useState("");
  const [ringtoneMessage, setRingtoneMessage] = useState("");
  const [ringtoneBusy, setRingtoneBusy] = useState(false);

  const copy =
    language === "ru"
      ? {
          title: "Настройки",
          intro: "Здесь управляются тема интерфейса, язык приложения и мелодия входящего звонка.",
          themeLabel: "Тема оформления",
          themeText: `Сейчас включена ${theme === "light" ? "светлая" : "тёмная"} тема.`,
          themeAction: theme === "light" ? "Включить тёмную тему" : "Включить светлую тему",
          languageLabel: "Язык интерфейса",
          languageText: "Переключает основные экраны приложения между русским и английским.",
          ringtoneLabel: "Мелодия входящего звонка",
          ringtoneText: "Выбери одну из встроенных мелодий или загрузи свой аудиофайл.",
          ringtoneBuiltIn: "Встроенные мелодии",
          ringtoneCustom: "Свой рингтон",
          ringtoneCurrent: "Используется сейчас",
          ringtoneUpload: "Загрузить свой рингтон",
          ringtoneUseCustom: "Использовать свой",
          ringtoneDeleteCustom: "Удалить свой",
          ringtoneCustomMissing: "Свой рингтон ещё не загружен.",
          ringtoneUploadHint: "Поддерживаются аудиофайлы: mp3, wav, ogg, m4a.",
          ringtoneSaved: "Мелодия звонка обновлена.",
          ringtoneDeleted: "Пользовательский рингтон удалён.",
          ringtoneInvalid: "Нужен аудиофайл.",
          russian: "Русский",
          english: "English"
        }
      : {
          title: "Settings",
          intro: "This screen controls the interface theme, app language, and the incoming call ringtone.",
          themeLabel: "Theme",
          themeText: `The ${theme === "light" ? "light" : "dark"} theme is currently active.`,
          themeAction: theme === "light" ? "Enable dark theme" : "Enable light theme",
          languageLabel: "Interface language",
          languageText: "Switches the main app screens between Russian and English.",
          ringtoneLabel: "Incoming call ringtone",
          ringtoneText: "Choose one of the built-in tones or upload your own audio file.",
          ringtoneBuiltIn: "Built-in tones",
          ringtoneCustom: "Custom ringtone",
          ringtoneCurrent: "Currently used",
          ringtoneUpload: "Upload custom ringtone",
          ringtoneUseCustom: "Use custom",
          ringtoneDeleteCustom: "Delete custom",
          ringtoneCustomMissing: "No custom ringtone uploaded yet.",
          ringtoneUploadHint: "Supported audio files: mp3, wav, ogg, m4a.",
          ringtoneSaved: "Call ringtone updated.",
          ringtoneDeleted: "Custom ringtone deleted.",
          ringtoneInvalid: "Please choose an audio file.",
          russian: "Russian",
          english: "English"
        };

  useEffect(() => {
    let active = true;

    async function loadRingtoneState() {
      try {
        const customExists = await hasCustomCallRingtone();
        if (!active) {
          return;
        }

        setHasCustomRingtoneOption(customExists);
        setCustomRingtoneName(getStoredCustomCallRingtoneName());
        setRingtoneChoice(getStoredCallRingtoneChoice());
      } catch {
        if (active) {
          setHasCustomRingtoneOption(false);
          setCustomRingtoneName("");
          setRingtoneChoice(getStoredCallRingtoneChoice());
        }
      }
    }

    void loadRingtoneState();

    return () => {
      active = false;
    };
  }, []);

  function handleSelectBuiltInRingtone(id: (typeof BUILT_IN_CALL_RINGTONES)[number]["id"]) {
    const nextChoice: CallRingtoneChoice = {
      type: "builtin",
      id
    };

    setStoredCallRingtoneChoice(nextChoice);
    setRingtoneChoice(nextChoice);
    setRingtoneMessage(copy.ringtoneSaved);
  }

  async function handleCustomRingtoneSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("audio/")) {
      setRingtoneMessage(copy.ringtoneInvalid);
      event.target.value = "";
      return;
    }

    setRingtoneBusy(true);
    setRingtoneMessage("");

    try {
      await saveCustomCallRingtone(file);
      const nextChoice: CallRingtoneChoice = {
        type: "custom"
      };

      setStoredCallRingtoneChoice(nextChoice);
      setRingtoneChoice(nextChoice);
      setHasCustomRingtoneOption(true);
      setCustomRingtoneName(file.name);
      setRingtoneMessage(copy.ringtoneSaved);
    } catch (error) {
      setRingtoneMessage(error instanceof Error ? error.message : copy.ringtoneInvalid);
    } finally {
      setRingtoneBusy(false);
      event.target.value = "";
    }
  }

  function handleUseCustomRingtone() {
    const nextChoice: CallRingtoneChoice = {
      type: "custom"
    };

    setStoredCallRingtoneChoice(nextChoice);
    setRingtoneChoice(nextChoice);
    setRingtoneMessage(copy.ringtoneSaved);
  }

  async function handleDeleteCustomRingtone() {
    setRingtoneBusy(true);
    setRingtoneMessage("");

    try {
      await deleteCustomCallRingtone();

      const fallbackChoice: CallRingtoneChoice = {
        type: "builtin",
        id: BUILT_IN_CALL_RINGTONES[0].id
      };

      setStoredCallRingtoneChoice(fallbackChoice);
      setRingtoneChoice(fallbackChoice);
      setHasCustomRingtoneOption(false);
      setCustomRingtoneName("");
      setRingtoneMessage(copy.ringtoneDeleted);
    } catch (error) {
      setRingtoneMessage(error instanceof Error ? error.message : copy.ringtoneInvalid);
    } finally {
      setRingtoneBusy(false);
    }
  }

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

        <div className="reference-action-row settings-row settings-ringtone-row">
          <div className="stack-xs settings-ringtone-copy">
            <div className="panel-title">{copy.ringtoneLabel}</div>
            <p className="reference-sheet-copy">{copy.ringtoneText}</p>
            <span className="settings-ringtone-helper">{copy.ringtoneUploadHint}</span>
            {ringtoneMessage ? <span className="settings-ringtone-message">{ringtoneMessage}</span> : null}
          </div>

          <div className="settings-ringtone-panel">
            <div className="settings-ringtone-group">
              <div className="settings-ringtone-group-title">{copy.ringtoneBuiltIn}</div>
              <div className="settings-ringtone-options">
                {BUILT_IN_CALL_RINGTONES.map((option) => {
                  const selected = ringtoneChoice.type === "builtin" && ringtoneChoice.id === option.id;

                  return (
                    <button
                      key={option.id}
                      className={`settings-ringtone-option ${selected ? "settings-ringtone-option-selected" : ""}`}
                      onClick={() => handleSelectBuiltInRingtone(option.id)}
                      type="button"
                    >
                      <strong>{option.label[language]}</strong>
                      <span>{option.description[language]}</span>
                      {selected ? <em>{copy.ringtoneCurrent}</em> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="settings-ringtone-group">
              <div className="settings-ringtone-group-title">{copy.ringtoneCustom}</div>
              <div className="settings-ringtone-custom">
                <div className="settings-ringtone-custom-copy">
                  <strong>{customRingtoneName || copy.ringtoneCustomMissing}</strong>
                  <span>
                    {ringtoneChoice.type === "custom" && hasCustomRingtoneOption ? copy.ringtoneCurrent : copy.ringtoneUploadHint}
                  </span>
                </div>

                <div className="settings-ringtone-custom-actions">
                  <button className="button button-secondary" disabled={ringtoneBusy} onClick={() => customRingtoneInputRef.current?.click()} type="button">
                    {copy.ringtoneUpload}
                  </button>
                  {hasCustomRingtoneOption ? (
                    <>
                      <button className="button button-primary" disabled={ringtoneBusy} onClick={handleUseCustomRingtone} type="button">
                        {copy.ringtoneUseCustom}
                      </button>
                      <button className="button button-secondary" disabled={ringtoneBusy} onClick={() => void handleDeleteCustomRingtone()} type="button">
                        {copy.ringtoneDeleteCustom}
                      </button>
                    </>
                  ) : null}
                </div>
                <input
                  accept="audio/*"
                  className="tg-file-input"
                  onChange={handleCustomRingtoneSelect}
                  ref={customRingtoneInputRef}
                  type="file"
                />
              </div>
            </div>
          </div>
        </div>

        <AdminConsole />
      </section>
    </AppShell>
  );
}
