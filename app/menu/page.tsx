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
          subtitle: "Навигация",
          title: "Меню",
          lead: "Быстрый доступ к основным разделам AmiGo.",
          back: "Назад",
          profile: "Профиль",
          chats: "Чаты",
          friends: "Друзья",
          requests: "Заявки",
          settings: "Настройки",
          profileHint: "Титулы, анкета и интересы.",
          chatsHint: "Личные переписки и медиа.",
          friendsHint: "Твои подтверждённые контакты.",
          requestsHint: "Новые входящие и исходящие заявки.",
          settingsHint: "Тема, язык и служебные опции.",
          darkTheme: "Включить тёмную тему",
          lightTheme: "Включить светлую тему",
          account: "Аккаунт",
          noAuth: "Вход не выполнен",
          signOut: "Выйти",
          signIn: "Войти"
        }
      : {
          subtitle: "Navigation",
          title: "Menu",
          lead: "Quick access to the main AmiGo sections.",
          back: "Back",
          profile: "Profile",
          chats: "Chats",
          friends: "Friends",
          requests: "Requests",
          settings: "Settings",
          profileHint: "Titles, profile and interests.",
          chatsHint: "Private conversations and media.",
          friendsHint: "Your confirmed contacts.",
          requestsHint: "New incoming and outgoing requests.",
          settingsHint: "Theme, language and utility options.",
          darkTheme: "Enable dark theme",
          lightTheme: "Enable light theme",
          account: "Account",
          noAuth: "Not signed in",
          signOut: "Sign out",
          signIn: "Sign in"
        };

  const links = [
    { href: "/profile", label: copy.profile, hint: copy.profileHint, mark: "ID" },
    { href: "/chats", label: copy.chats, hint: copy.chatsHint, mark: "DM" },
    { href: "/friends", label: copy.friends, hint: copy.friendsHint, mark: "FR" },
    { href: "/requests", label: copy.requests, hint: copy.requestsHint, mark: "RQ" },
    { href: "/settings", label: copy.settings, hint: copy.settingsHint, mark: "ST" }
  ] as const;
  const sectionsLabel = language === "ru" ? `${links.length} разделов` : `${links.length} sections`;
  const quickAccessLabel = language === "ru" ? "Быстрый доступ" : "Quick access";
  const themeSectionLabel = language === "ru" ? "Оформление" : "Appearance";
  const themeStateLabel = language === "ru" ? (theme === "light" ? "Светлая" : "Тёмная") : theme === "light" ? "Light" : "Dark";
  const accountStateLabel = language === "ru" ? (session ? "Аккаунт активен" : "Гостевой режим") : session ? "Account active" : "Guest mode";

  return (
    <main className="menu-page modern-menu-page">
      <section className="menu-sheet modern-menu-sheet">
        <header className="modern-menu-hero">
          <div className="modern-head-copy">
            <span className="modern-kicker">{copy.subtitle}</span>
            <h1 className="modern-screen-title">{copy.title}</h1>
            <p className="modern-screen-text">{copy.lead}</p>
            <div className="modern-menu-meta">
              <span className="modern-menu-meta-pill">{sectionsLabel}</span>
              <span className="modern-menu-meta-pill">{quickAccessLabel}</span>
            </div>
          </div>

          <div className="modern-menu-side">
            <button aria-label={copy.back} className="menu-close modern-menu-close" onClick={() => router.back()} type="button">
              {copy.back}
            </button>
            <div className="modern-menu-status">
              <span className="modern-menu-status-label">{copy.account}</span>
              <strong>{session?.user.email ?? copy.noAuth}</strong>
            </div>
          </div>
        </header>

        <nav className="modern-menu-links">
          {links.map((link) => (
            <Link key={link.href} className="modern-menu-link" href={link.href}>
              <span className="modern-menu-link-mark">{link.mark}</span>
              <span className="modern-menu-link-copy">
                <strong>{link.label}</strong>
                <span>{link.hint}</span>
              </span>
              <span className="modern-menu-arrow">{">"}</span>
            </Link>
          ))}
        </nav>

        <div className="menu-footer modern-menu-footer">
          <div className="modern-menu-tools">
            <button className="theme-toggle modern-theme-toggle" onClick={toggleTheme} type="button">
              <span className="modern-theme-copy">
                <span className="modern-tool-kicker">{themeSectionLabel}</span>
                <span className="theme-toggle-label">{theme === "light" ? copy.darkTheme : copy.lightTheme}</span>
              </span>
              <span className="theme-toggle-badge">{themeStateLabel}</span>
            </button>

            <div className="session-box modern-account-box">
              <span className="modern-tool-kicker">{copy.account}</span>
              <strong className="menu-account-email">{session?.user.email ?? copy.noAuth}</strong>
              <span className="modern-account-status">{accountStateLabel}</span>
            </div>
          </div>

          {session ? (
            <button className="button button-secondary modern-menu-action" onClick={() => void signOut()} type="button">
              {copy.signOut}
            </button>
          ) : (
            <Link className="button button-primary modern-menu-action" href="/auth">
              {copy.signIn}
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
