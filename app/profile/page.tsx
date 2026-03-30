"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminUnlockModal } from "@/components/admin-unlock-modal";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { TagSelector } from "@/components/tag-selector";
import { TitleBadge } from "@/components/title-badge";
import { UserAvatar } from "@/components/user-avatar";
import { INTEREST_OPTIONS } from "@/lib/constants";
import { createInitialProfile } from "@/lib/profile-defaults";
import { setActiveProfileTitle, upsertProfile } from "@/lib/supabase/queries";
import { resolveActiveTitle } from "@/lib/title-system";
import type { Interest, UserProfile } from "@/lib/types";

const MIN_INTERESTS = 5;
const MIN_BIO_LENGTH = 20;

export default function ProfilePage() {
  const router = useRouter();
  const { session, profile, access, refreshProfile, supabase } = useAuth();
  const [form, setForm] = useState<UserProfile | null>(null);
  const [savedAt, setSavedAt] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [lastTapAt, setLastTapAt] = useState(0);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [interestQuery, setInterestQuery] = useState("");

  useEffect(() => {
    if (!session) {
      setForm(null);
      return;
    }

    setForm(profile ?? createInitialProfile(session.user.id));
  }, [profile, session]);

  const filteredInterests = useMemo(() => {
    const normalized = interestQuery.trim().toLowerCase();
    if (!normalized) {
      return INTEREST_OPTIONS;
    }

    return INTEREST_OPTIONS.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [interestQuery]);

  const isReady = useMemo(() => {
    if (!form) {
      return false;
    }

    return form.name.trim().length > 1 && form.bio.trim().length >= MIN_BIO_LENGTH && form.interests.length >= MIN_INTERESTS;
  }, [form]);

  function updateForm(patch: Partial<UserProfile>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function toggleInterest(value: Interest) {
    setForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        interests: current.interests.includes(value)
          ? current.interests.filter((item) => item !== value)
          : [...current.interests, value]
      };
    });
  }

  function selectActiveTitle(titleId: string) {
    setForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        activeTitleId: titleId,
        activeTitle: resolveActiveTitle(current.titles, titleId)
      };
    });
  }

  async function handleSave() {
    if (!form || !session) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      let savedProfile = await upsertProfile(supabase, {
        ...form,
        id: session.user.id
      });

      if (form.activeTitleId) {
        const persistedTitleId = await setActiveProfileTitle(supabase, form.activeTitleId);
        savedProfile = {
          ...savedProfile,
          activeTitleId: persistedTitleId,
          activeTitle: resolveActiveTitle(savedProfile.titles, persistedTitleId)
        };
      }

      setForm(savedProfile);
      await refreshProfile();
      setSavedAt(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit"
        })
      );
      setMessage("Профиль сохранён.");
      router.push("/chats");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
    }
  }

  function handleBrandTap() {
    if (access.isAdmin) {
      return;
    }

    const now = Date.now();
    const nextCount = now - lastTapAt > 12000 ? 1 : tapCount + 1;
    setLastTapAt(now);
    setTapCount(nextCount);

    if (nextCount >= 20) {
      setTapCount(0);
      setUnlockOpen(true);
    }
  }

  if (!session) {
    return (
      <AppShell mode="plain" title="Профиль" description="">
        <section className="reference-sheet stack-lg">
          <div className="reference-sheet-top">
            <button className="reference-brand-button" onClick={handleBrandTap} type="button">
              AmiGo
            </button>
          </div>
          <div className="screen-heading-row">
            <h1 className="reference-sheet-heading">Профиль</h1>
          </div>
        </section>
      </AppShell>
    );
  }

  if (!form) {
    return (
      <AppShell mode="plain" title="Профиль" description="">
        <section className="reference-sheet stack-lg">
          <div className="reference-sheet-top">
            <button className="reference-brand-button" onClick={handleBrandTap} type="button">
              AmiGo
            </button>
          </div>
          <div className="screen-heading-row">
            <h1 className="reference-sheet-heading">Профиль</h1>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell mode="plain" title="Профиль" description="">
        <section className="reference-sheet profile-sheet stack-xl">
          <div className="reference-sheet-top">
            <button className="reference-brand-button" onClick={handleBrandTap} type="button">
              AmiGo
            </button>
          </div>

          <div className="reference-profile-hero reference-profile-hero-sheet">
            <div className="reference-profile-left">
              <UserAvatar className="profile-sheet-avatar" name={form.name || "AmiGo"} size="lg" src={form.avatar} />

              <div className="reference-identity">
                <strong>{form.name || "Без имени"}</strong>
                <span>{form.amigoId || "ID появится после первого сохранения"}</span>
              </div>
            </div>

            <div className="reference-profile-right">
              <div className="screen-heading-row screen-heading-row-compact">
                <div className="stack-xs">
                  <h1 className="reference-sheet-heading">Профиль</h1>
                  <p className="reference-sheet-copy">Титул, данные профиля и интересы собраны в одном месте.</p>
                </div>
              </div>

              <TitleBadge title={form.activeTitle} />

              <div className="title-switcher">
                {form.titles.map((title) => (
                  <button
                    key={title.id}
                    className={`title-switcher-item ${form.activeTitleId === title.id ? "is-active" : ""}`}
                    onClick={() => selectActiveTitle(title.id)}
                    type="button"
                  >
                    <TitleBadge compact title={title} />
                  </button>
                ))}
              </div>

              <div className="reference-inline-pills">
                <span className="reference-meta-pill">State ID {form.stateId || "pending"}</span>
                <span className="reference-meta-pill">{access.isAdmin ? "Администратор" : "Пользователь"}</span>
                <span className="reference-meta-pill">Титулов: {form.titles.length}</span>
              </div>
            </div>
          </div>

          <div className="reference-form-grid">
            <div className="reference-form-column stack-md">
              <div className="form-row">
                <label htmlFor="name">Имя или ник</label>
                <input id="name" onChange={(event) => updateForm({ name: event.target.value })} value={form.name} />
              </div>

              <div className="form-row">
                <label htmlFor="age">Возраст</label>
                <input
                  id="age"
                  max={99}
                  min={16}
                  onChange={(event) => updateForm({ age: Number(event.target.value) || form.age })}
                  type="number"
                  value={form.age}
                />
              </div>

              <div className="form-row">
                <label htmlFor="avatar">Ссылка на аватар</label>
                <input id="avatar" onChange={(event) => updateForm({ avatar: event.target.value })} value={form.avatar} />
              </div>

              <div className="form-row">
                <label htmlFor="bio">О себе</label>
                <textarea
                  id="bio"
                  onChange={(event) => updateForm({ bio: event.target.value })}
                  rows={6}
                  value={form.bio}
                />
                <div className="field-note">
                  Минимум {MIN_BIO_LENGTH} символов. Сейчас: {form.bio.trim().length}
                </div>
              </div>
            </div>

            <div className="reference-form-column stack-md">
              <div className="form-row">
                <label htmlFor="interest-search">Поиск интересов</label>
                <input
                  id="interest-search"
                  onChange={(event) => setInterestQuery(event.target.value)}
                  value={interestQuery}
                />
              </div>

              <TagSelector<Interest> onToggle={toggleInterest} options={filteredInterests} selected={form.interests} />

              <div className="reference-inline-pills">
                <span className="reference-meta-pill">Выбрано: {form.interests.length}</span>
                <span className="reference-meta-pill">Минимум: {MIN_INTERESTS}</span>
                <span className="reference-meta-pill">{isReady ? "Готово" : "Заполни до конца"}</span>
              </div>
            </div>
          </div>

          <div className="reference-action-row">
            <div className="stack-xs">
              <p className="reference-sheet-copy">
                {isReady
                  ? "Профиль готов к поиску и заявкам."
                  : `Нужно описание от ${MIN_BIO_LENGTH} символов и минимум ${MIN_INTERESTS} интересов.`}
              </p>
              <div className="reference-inline-pills">
                <span className="reference-meta-pill">
                  {savedAt ? `Сохранено в ${savedAt}` : "Ещё не сохранено"}
                </span>
              </div>
            </div>

            <button
              className="button button-primary"
              disabled={saving || !isReady}
              onClick={() => void handleSave()}
              type="button"
            >
              {saving ? "Сохраняю..." : "Сохранить профиль"}
            </button>
          </div>

          {message ? <div className="reference-sheet-message">{message}</div> : null}
        </section>
      </AppShell>

      <AdminUnlockModal
        onClose={() => setUnlockOpen(false)}
        onSuccess={() => setMessage("Права администратора подтверждены для этого аккаунта.")}
        open={unlockOpen}
      />
    </>
  );
}
