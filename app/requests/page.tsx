"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { UserAvatar } from "@/components/user-avatar";
import { getInterestLabels } from "@/lib/constants";
import { acceptFriendRequest, listFriendRequests, listFriends } from "@/lib/supabase/queries";
import type { FriendRequestRecord } from "@/lib/types";

export default function RequestsPage() {
  const { loading, session, supabase } = useAuth();
  const [requests, setRequests] = useState<FriendRequestRecord[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!session) {
      setRequests([]);
      return;
    }

    const currentUserId = session.user.id;
    let active = true;

    async function loadRequests() {
      try {
        const requestList = await listFriendRequests(supabase, currentUserId);
        if (active) {
          setRequests(requestList);
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Не удалось загрузить заявки.");
        }
      }
    }

    void loadRequests();

    return () => {
      active = false;
    };
  }, [session, supabase]);

  const filteredRequests = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return requests;
    }

    return requests.filter((request) =>
      [request.profile.name, request.profile.bio, request.profile.amigoId, ...getInterestLabels(request.profile.interests)]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [requests, query]);

  async function handleAccept(request: FriendRequestRecord) {
    if (!session) {
      return;
    }

    try {
      await acceptFriendRequest(supabase, request.requestId);
      const requestList = await listFriendRequests(supabase, session.user.id);
      setRequests(requestList);
      setMessage(`${request.profile.name} теперь в друзьях.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось принять заявку.");
    }
  }

  if (!session && !loading) {
    return (
      <AppShell mode="plain" title="Заявки" description="">
        <section className="reference-sheet dialog-sheet stack-lg">
          <div className="reference-sheet-top">
            <span className="reference-brand-label">AmiGo</span>
          </div>

          <div className="reference-empty">
            <p>Нужен вход, чтобы открыть заявки.</p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/auth">
                Войти
              </Link>
            </div>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell mode="plain" title="Заявки" description="">
      <section className="reference-sheet dialog-sheet stack-lg">
        <div className="reference-sheet-top">
          <span className="reference-brand-label">AmiGo</span>
        </div>

        {message ? <div className="reference-sheet-message">{message}</div> : null}

        <div className="reference-sheet-block stack-sm">
          <h1 className="reference-sheet-heading">Заявки</h1>
          <input
            className="reference-search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder=""
            value={query}
          />
        </div>

        {filteredRequests.length === 0 ? (
          <div className="reference-empty reference-empty-compact">
            <p>{requests.length === 0 ? "Новых заявок пока нет." : "Поиск по заявкам пустой."}</p>
          </div>
        ) : (
          <div className="request-list">
            {filteredRequests.map((request) => (
              <article key={request.requestId} className="request-row">
                <div className="request-row-main">
                  <UserAvatar name={request.profile.name} size="sm" src={request.profile.avatar} />
                  <div className="request-row-copy">
                    <strong>{request.profile.name}</strong>
                    <span>{request.profile.amigoId}</span>
                    <p>{request.direction === "incoming" ? "Входящая заявка" : "Заявка отправлена"}</p>
                  </div>
                </div>

                {request.direction === "incoming" ? (
                  <button className="button button-primary" onClick={() => void handleAccept(request)} type="button">
                    Принять
                  </button>
                ) : (
                  <span className="reference-meta-pill">Ожидает ответа</span>
                )}
              </article>
            ))}
          </div>
        )}

        <div className="reference-bottom-action">
          <Link className="button button-primary reference-bottom-button" href="/discover">
            Найти собеседника
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
