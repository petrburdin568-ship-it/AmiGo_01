"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import {
  getProfileByAmigoId,
  listFriendRequests,
  listFriends,
  requestFriendship
} from "@/lib/supabase/queries";
import type { FriendRecord, FriendRequestRecord, UserProfile } from "@/lib/types";

export default function DiscoverPage() {
  const { loading, profile, session, supabase } = useAuth();
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [requests, setRequests] = useState<FriendRequestRecord[]>([]);
  const [idLookup, setIdLookup] = useState("");
  const [message, setMessage] = useState("");
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!session) {
      setFriends([]);
      setRequests([]);
      return;
    }

    const userId = session.user.id;
    let active = true;

    async function loadData() {
      setLoadingData(true);

      try {
        const [friendList, requestList] = await Promise.all([
          listFriends(supabase, userId),
          listFriendRequests(supabase, userId)
        ]);

        if (!active) {
          return;
        }

        setFriends(friendList);
        setRequests(requestList);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Не удалось загрузить каталог.");
        }
      } finally {
        if (active) {
          setLoadingData(false);
        }
      }
    }

    void loadData();

    return () => {
      active = false;
    };
  }, [session, supabase]);

  const friendIds = useMemo(() => friends.map((item) => item.profile.id), [friends]);
  const pendingRequestIds = useMemo(
    () => requests.filter((item) => item.direction === "outgoing").map((item) => item.profile.id),
    [requests]
  );
  const outgoingRequests = useMemo(
    () => requests.filter((item) => item.direction === "outgoing"),
    [requests]
  );
  const incomingCount = useMemo(
    () => requests.filter((item) => item.direction === "incoming").length,
    [requests]
  );

  async function reloadLists(currentUserId: string) {
    const [friendList, requestList] = await Promise.all([
      listFriends(supabase, currentUserId),
      listFriendRequests(supabase, currentUserId)
    ]);

    setFriends(friendList);
    setRequests(requestList);
  }

  async function handleRequest(userProfile: UserProfile) {
    if (!session) {
      return;
    }

    try {
      const result = await requestFriendship(supabase, session.user.id, userProfile.id);
      await reloadLists(session.user.id);
      setMessage(
        result.became_friends
          ? `${userProfile.name} теперь в друзьях.`
          : `Заявка для ${userProfile.name} отправлена.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить заявку.");
    }
  }

  async function handleAddById() {
    if (!session || !idLookup.trim()) {
      return;
    }

    try {
      const foundProfile = await getProfileByAmigoId(supabase, idLookup);

      if (!foundProfile) {
        setMessage("Пользователь с таким AmiGo ID не найден.");
        return;
      }

      if (foundProfile.id === session.user.id) {
        setMessage("Нельзя отправить заявку самому себе.");
        return;
      }

      if (friendIds.includes(foundProfile.id)) {
        setMessage(`${foundProfile.name} уже в друзьях.`);
        return;
      }

      if (pendingRequestIds.includes(foundProfile.id)) {
        setMessage(`Заявка для ${foundProfile.name} уже отправлена.`);
        return;
      }

      await handleRequest(foundProfile);
      setIdLookup("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить заявку по ID.");
    }
  }

  if (!session && !loading) {
    return (
      <AppShell mode="plain" title="Добавить друга" description="">
        <section className="discover-plain-block stack-md">
          <h1 className="reference-sheet-heading">Добавить друга</h1>
          <p className="reference-sheet-copy">Войди в аккаунт, чтобы отправлять заявки по AmiGo ID.</p>
          <Link className="button button-primary" href="/auth">
            Войти
          </Link>
        </section>
      </AppShell>
    );
  }

  if (!profile && !loading) {
    return (
      <AppShell mode="plain" title="Добавить друга" description="">
        <section className="discover-plain-block stack-md">
          <h1 className="reference-sheet-heading">Добавить друга</h1>
          <p className="reference-sheet-copy">Сначала заполни профиль, потом можно будет отправлять заявки по AmiGo ID.</p>
          <Link className="button button-primary" href="/profile">
            Перейти к профилю
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell mode="plain" title="Добавить друга" description="">
      <section className="stack-xl">
        <div className="screen-heading-row">
          <div className="stack-xs">
            <h1 className="reference-sheet-heading">Добавить друга</h1>
            <p className="reference-sheet-copy">Подбор по интересам убран. Теперь друзей можно добавлять напрямую по AmiGo ID.</p>
          </div>
          <Link className="button button-secondary" href="/requests">
            Заявки
          </Link>
        </div>

        <section className="grid grid-2 search-hero-grid discover-plain-grid">
          <div className="discover-plain-block stack-md">
            <div className="panel-title">Добавить по ID</div>
            <div className="chat-input-row">
              <input
                onChange={(event) => setIdLookup(event.target.value)}
                placeholder="AMG-USER-0001"
                value={idLookup}
              />
              <button className="button button-primary" onClick={() => void handleAddById()} type="button">
                Добавить
              </button>
            </div>
            <p className="reference-sheet-copy">
              Твой ID: <span className="inline-accent">{profile?.amigoId}</span>
            </p>
          </div>

          <div className="discover-plain-block stack-md">
            <div className="panel-title">Быстрый доступ</div>
            <p className="reference-sheet-copy">Управляй подтверждёнными контактами и входящими заявками из соседних разделов.</p>
            <div className="hero-actions">
              <Link className="button button-secondary" href="/friends">
                Друзья
              </Link>
              <Link className="button button-secondary" href="/requests">
                Заявки
              </Link>
            </div>
            <p className="reference-sheet-copy">
              Если человек уже есть у тебя в друзьях или заявка ещё ожидает ответа, приложение подскажет это перед отправкой.
            </p>
          </div>
        </section>

        <div className="row-between compact-row toolbar-row">
          <div className="status-strip">
            <span>{loadingData ? "Обновляем данные..." : `${friends.length} друзей`}</span>
            <span>{incomingCount} входящих заявок</span>
            <span>{outgoingRequests.length} исходящих заявок</span>
          </div>
        </div>

        {message ? <div className="toast-panel">{message}</div> : null}

        {outgoingRequests.length === 0 ? (
          <section className="discover-plain-block stack-md">
            <div className="panel-title">Новых исходящих заявок нет</div>
            <p className="reference-sheet-copy">Когда отправишь запрос по AmiGo ID, он появится здесь до подтверждения.</p>
          </section>
        ) : (
          <section className="discover-plain-block stack-md">
            <div className="panel-title">Ожидают ответа</div>
            <div className="request-list">
              {outgoingRequests.map((request) => (
                <article key={request.requestId} className="request-row">
                  <div className="request-row-copy">
                    <strong>{request.profile.name}</strong>
                    <span>{request.profile.amigoId}</span>
                    <p>Заявка отправлена и ждёт ответа.</p>
                  </div>
                  <span className="reference-meta-pill">Исходящая</span>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
    </AppShell>
  );
}
