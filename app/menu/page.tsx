"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";

export default function MenuPage() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language } = useLanguage();

  const copy =
    language === "ru"
      ? {
          subtitle: "Меню",
          back: "Назад",
          profile: "Профиль",
          chats: "Чаты",
          friends: "Друзья",
          requests: "Заявки",
          settings: "Настройки",
          darkTheme: "Включить тёмную тему",
          lightTheme: "Включить светлую тему",
          account: "Аккаунт",
          noAuth: "Вход не выполнен",
          signOut: "Выйти",
          signIn: "Войти"
        }
      : {
          subtitle: "Menu",
          back: "Back",
          profile: "Profile",
          chats: "Chats",
          friends: "Friends",
          requests: "Requests",
          settings: "Settings",
          darkTheme: "Enable dark theme",
          lightTheme: "Enable light theme",
          account: "Account",
          noAuth: "Not signed in",
          signOut: "Sign out",
          signIn: "Sign in"
        };

  const links = [
    { href: "/profile", label: copy.profile },
    { href: "/chats", label: copy.chats },
    { href: "/friends", label: copy.friends },
    { href: "/requests", label: copy.requests },
    { href: "/settings", label: copy.settings }
  ] as const;

  return (
    <main className="menu-page">
      <section className="menu-sheet">
        <div className="menu-topbar">
          <div className="brand">
            <span className="brand-mark">AmiGo</span>
            <span className="brand-subtitle">{copy.subtitle}</span>
          </div>

          <button aria-label={copy.back} className="menu-close" onClick={() => router.back()} type="button">
            {copy.back}
          </button>
        </div>

        <nav className="menu-links">
          {links.map((link) => (
            <Link key={link.href} className="menu-link" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="menu-footer">
          <button className="theme-toggle" onClick={toggleTheme} type="button">
            <span className="theme-toggle-label">{theme === "light" ? copy.darkTheme : copy.lightTheme}</span>
            <span className="theme-toggle-badge">{theme === "light" ? "Dark" : "Light"}</span>
          </button>

          <div className="session-box">
            <span className="session-label">{copy.account}</span>
            <strong className="menu-account-email">{session?.user.email ?? copy.noAuth}</strong>
          </div>

          {session ? (
            <button className="button button-secondary" onClick={() => void signOut()} type="button">
              {copy.signOut}
            </button>
          ) : (
            <Link className="button button-primary" href="/auth">
              {copy.signIn}
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
