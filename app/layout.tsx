import type { Metadata } from "next";
import Script from "next/script";
import "@/app/globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { GlobalActivity } from "@/components/global-activity";
import { LanguageProvider } from "@/components/language-provider";
import { Navigation } from "@/components/navigation";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "AmiGo",
  description: "AmiGo is a social chat app for finding friends by AmiGo ID, search, and direct messaging."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="amigo-theme-init" strategy="beforeInteractive">
          {`
            try {
              const storedTheme = window.localStorage.getItem("amigo-theme");
              const storedLanguage = window.localStorage.getItem("amigo-language");
              const theme = storedTheme === "light" || storedTheme === "dark"
                ? storedTheme
                : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
              document.body.dataset.theme = theme;
              document.documentElement.style.colorScheme = theme;
              document.documentElement.lang = storedLanguage === "en" ? "en" : "ru";
            } catch {}
          `}
        </Script>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <div className="background-orb background-orb-left" />
              <div className="background-orb background-orb-right" />
              <div className="page-shell app-frame">
                <GlobalActivity />
                <Navigation />
                <main className="main-content">{children}</main>
              </div>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
