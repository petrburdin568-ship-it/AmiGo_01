"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";

type AuthMode = "sign-in" | "sign-up" | "reset";

export default function AuthPage() {
  const { session, supabase } = useAuth();
  const { language } = useLanguage();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const copy =
    language === "ru"
      ? {
          signedIn: "Ты уже в аккаунте",
          currentEmail: "Текущий email",
          openProfile: "Открыть профиль",
          openChats: "Перейти к чатам",
          signIn: "Вход",
          signUp: "Регистрация",
          reset: "Сброс пароля",
          password: "Пароль",
          wait: "Подожди...",
          createAccount: "Создать аккаунт",
          sendEmail: "Отправить письмо",
          enter: "Войти",
          forgot: "Забыли пароль?",
          signUpDone: "Аккаунт создан. Теперь можно войти.",
          signUpConfirm:
            "Аккаунт создан. Если в проекте включено подтверждение почты, подтверди email и войди.",
          resetDone: "Письмо для сброса пароля отправлено. Открой ссылку из email.",
          signInDone: "Вход выполнен.",
          actionFailed: "Не удалось выполнить действие."
        }
      : {
          signedIn: "You are already signed in",
          currentEmail: "Current email",
          openProfile: "Open profile",
          openChats: "Go to chats",
          signIn: "Sign in",
          signUp: "Sign up",
          reset: "Reset password",
          password: "Password",
          wait: "Please wait...",
          createAccount: "Create account",
          sendEmail: "Send email",
          enter: "Sign in",
          forgot: "Forgot password?",
          signUpDone: "Account created. You can sign in now.",
          signUpConfirm: "Account created. If email confirmation is enabled, confirm your email and sign in.",
          resetDone: "Password reset email sent. Open the link from your inbox.",
          signInDone: "Signed in successfully.",
          actionFailed: "Failed to complete the action."
        };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) {
          throw error;
        }

        setMessage(data.session ? copy.signUpDone : copy.signUpConfirm);
        return;
      }

      if (mode === "reset") {
        const redirectTo =
          typeof window !== "undefined" ? `${window.location.origin}/auth/reset-password` : undefined;

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo
        });

        if (error) {
          throw error;
        }

        setMessage(copy.resetDone);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }

      setMessage(copy.signInDone);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.actionFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title={copy.signIn} description="">
      <section className="auth-screen">
        {session ? (
          <section className="auth-card stack-md">
            <div className="panel-title">{copy.signedIn}</div>
            <p className="muted-copy">
              {copy.currentEmail}: {session.user.email}
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/profile">
                {copy.openProfile}
              </Link>
              <Link className="button button-secondary" href="/chats">
                {copy.openChats}
              </Link>
            </div>
          </section>
        ) : (
          <section className="auth-card">
            <div className="auth-tabs">
              <button
                className={`tag tag-selectable ${mode === "sign-in" ? "tag-selected" : ""}`}
                onClick={() => setMode("sign-in")}
                type="button"
              >
                {copy.signIn}
              </button>
              <button
                className={`tag tag-selectable ${mode === "sign-up" ? "tag-selected" : ""}`}
                onClick={() => setMode("sign-up")}
                type="button"
              >
                {copy.signUp}
              </button>
              <button
                className={`tag tag-selectable ${mode === "reset" ? "tag-selected" : ""}`}
                onClick={() => setMode("reset")}
                type="button"
              >
                {copy.reset}
              </button>
            </div>

            <form className="stack-md" onSubmit={handleSubmit}>
              <div className="form-row">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>

              {mode !== "reset" ? (
                <div className="form-row">
                  <label htmlFor="password">{copy.password}</label>
                  <input
                    id="password"
                    minLength={6}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </div>
              ) : null}

              <button className="button button-primary" disabled={loading} type="submit">
                {loading
                  ? copy.wait
                  : mode === "sign-up"
                    ? copy.createAccount
                    : mode === "reset"
                      ? copy.sendEmail
                      : copy.enter}
              </button>
            </form>

            {mode === "sign-in" ? (
              <div className="auth-secondary-row">
                <button className="text-link-button" onClick={() => setMode("reset")} type="button">
                  {copy.forgot}
                </button>
              </div>
            ) : null}

            {message ? <div className="toast-panel">{message}</div> : null}
          </section>
        )}
      </section>
    </AppShell>
  );
}
