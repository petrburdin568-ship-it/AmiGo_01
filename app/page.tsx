"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";

export default function HomePage() {
  const router = useRouter();
  const { loading, session } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    router.replace(session ? "/chats" : "/auth");
  }, [loading, router, session]);

  return (
    <AppShell title="AmiGo" description="">
      <section className="auth-card stack-md">
        <div className="panel-title">Загружаем AmiGo</div>
        <p className="muted-copy">Переходим к экрану входа.</p>
      </section>
    </AppShell>
  );
}
