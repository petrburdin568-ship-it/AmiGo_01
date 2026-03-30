"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { TitleTone } from "@/lib/types";

const toneOptions: Array<{ value: TitleTone; label: string }> = [
  { value: "gold", label: "Золото" },
  { value: "silver", label: "Серебро" },
  { value: "cyan", label: "Ледяной" },
  { value: "royal", label: "Имперский" }
];

export function AdminConsole() {
  const { access, session } = useAuth();
  const [amigoId, setAmigoId] = useState("");
  const [titleText, setTitleText] = useState("");
  const [icon, setIcon] = useState("ADM");
  const [tone, setTone] = useState<TitleTone>("gold");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!access.isAdmin) {
    return null;
  }

  async function handleGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/grant-title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          amigoId,
          titleText,
          icon,
          tone
        })
      });

      const payload = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "Не удалось выдать титул.");
      }

      setMessage(payload.message ?? "Админский титул выдан.");
      setAmigoId("");
      setTitleText("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выдать титул.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="reference-divider" />

      <section className="reference-sheet-block stack-md">
        <div className="reference-action-row reference-action-row-top">
          <div className="stack-xs">
            <div className="reference-section-kicker">Управление титулами</div>
            <p className="reference-sheet-copy">
              Здесь выдается только админский титул. Системные титулы остаются у пользователя отдельно.
            </p>
          </div>

          <div className="reference-inline-pills">
            <span className="reference-meta-pill">служебный доступ</span>
            <span className="reference-meta-pill">{access.canGrantCustomTitles ? "title grantor" : "view only"}</span>
          </div>
        </div>

        <form className="stack-md" onSubmit={handleGrant}>
          <div className="reference-form-grid reference-form-grid-compact">
            <div className="reference-form-column stack-md">
              <div className="form-row">
                <label htmlFor="admin-amigo-id">AmiGo ID</label>
                <input
                  id="admin-amigo-id"
                  onChange={(event) => setAmigoId(event.target.value)}
                  placeholder="AMG-PETR-0001"
                  value={amigoId}
                />
              </div>

              <div className="form-row">
                <label htmlFor="admin-title">Текст титула</label>
                <input
                  id="admin-title"
                  onChange={(event) => setTitleText(event.target.value)}
                  placeholder="Например, Гладиатор"
                  value={titleText}
                />
              </div>
            </div>

            <div className="reference-form-column stack-md">
              <div className="form-row">
                <label htmlFor="admin-icon">Короткая иконка</label>
                <input
                  id="admin-icon"
                  maxLength={6}
                  onChange={(event) => setIcon(event.target.value.toUpperCase())}
                  placeholder="ADM"
                  value={icon}
                />
              </div>

              <div className="form-row">
                <label htmlFor="admin-tone">Тон свечения</label>
                <select id="admin-tone" onChange={(event) => setTone(event.target.value as TitleTone)} value={tone}>
                  {toneOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="reference-bottom-action reference-bottom-action-left">
            <button className="button button-primary" disabled={loading || !access.canGrantCustomTitles} type="submit">
              {loading ? "Выдаем титул..." : "Выдать админский титул"}
            </button>
          </div>
        </form>

        {message ? <div className="reference-sheet-message">{message}</div> : null}
      </section>
    </>
  );
}
