"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";

export default function ResetPasswordPage() {
  const { supabase } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (active && session) {
        setRecoveryReady(true);
      }
    }

    void bootstrap();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" || !!session) {
        setRecoveryReady(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password.length < 6) {
      setMessage("Пароль должен быть не короче 6 символов.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Пароли не совпадают.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password
      });

      if (error) {
        throw error;
      }

      setMessage("Пароль обновлен. Теперь можно войти с новым паролем.");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить пароль.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Новый пароль" description="Открой эту страницу по ссылке из письма Supabase и задай новый пароль.">
      <section className="auth-card stack-md">
        {!recoveryReady ? (
          <>
            <div className="panel-title">Ссылка для восстановления не активна</div>
            <p className="muted-copy">Открой эту страницу именно по ссылке из письма для сброса пароля.</p>
            <Link className="button button-secondary" href="/auth">
              Вернуться ко входу
            </Link>
          </>
        ) : (
          <>
            <div className="panel-title">Задай новый пароль</div>

            <form className="stack-md" onSubmit={handleSubmit}>
              <div className="form-row">
                <label htmlFor="new-password">Новый пароль</label>
                <input
                  id="new-password"
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Минимум 6 символов"
                  required
                  type="password"
                  value={password}
                />
              </div>

              <div className="form-row">
                <label htmlFor="confirm-password">Повтори пароль</label>
                <input
                  id="confirm-password"
                  minLength={6}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Повтори новый пароль"
                  required
                  type="password"
                  value={confirmPassword}
                />
              </div>

              <button className="button button-primary" disabled={loading} type="submit">
                {loading ? "Обновляю..." : "Сохранить новый пароль"}
              </button>
            </form>

            <Link className="button button-secondary" href="/auth">
              К экрану входа
            </Link>
          </>
        )}

        {message ? <div className="toast-panel">{message}</div> : null}
      </section>
    </AppShell>
  );
}
