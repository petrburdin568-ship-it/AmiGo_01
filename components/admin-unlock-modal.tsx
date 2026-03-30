"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";

type AdminUnlockModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AdminUnlockModal({ open, onClose, onSuccess }: AdminUnlockModalProps) {
  const { refreshAdminAccess, session } = useAuth();
  const [keys, setKeys] = useState(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          keys
        })
      });

      const payload = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "Ключи не прошли проверку.");
      }

      await refreshAdminAccess();
      onSuccess();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось разблокировать режим.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="stack-sm">
          <div className="panel-title">Административный доступ</div>
          <p className="muted-copy">
            Введи три ключа. Проверка идет на сервере, ключи не хранятся в клиентском коде.
          </p>
        </div>

        <form className="stack-md" onSubmit={handleSubmit}>
          {keys.map((value, index) => (
            <div key={index} className="form-row">
              <label htmlFor={`admin-key-${index}`}>Ключ {index + 1}</label>
              <input
                id={`admin-key-${index}`}
                onChange={(event) =>
                  setKeys((current) =>
                    current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item))
                  )
                }
                placeholder="Введи секретный ключ"
                type="password"
                value={value}
              />
            </div>
          ))}

          <div className="hero-actions">
            <button className="button button-primary" disabled={loading} type="submit">
              {loading ? "Проверяем..." : "Открыть доступ"}
            </button>
            <button className="button button-secondary" onClick={onClose} type="button">
              Отмена
            </button>
          </div>
        </form>

        {message ? <div className="toast-panel">{message}</div> : null}
      </section>
    </div>
  );
}
