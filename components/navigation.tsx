"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";

export function Navigation() {
  const pathname = usePathname();
  const { session } = useAuth();
  const { language } = useLanguage();

  const hidden = useMemo(() => {
    if (pathname === "/menu") {
      return true;
    }

    if (!session && (pathname === "/" || pathname === "/auth" || pathname === "/auth/reset-password")) {
      return true;
    }

    return false;
  }, [pathname, session]);

  if (hidden) {
    return null;
  }

  return (
    <Link aria-label={language === "ru" ? "Открыть меню" : "Open menu"} className="nav-trigger" href="/menu">
      <span />
      <span />
      <span />
    </Link>
  );
}
