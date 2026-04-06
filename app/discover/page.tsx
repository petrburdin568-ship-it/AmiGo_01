"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { ProfileCard } from "@/components/profile-card";
import { INTEREST_OPTIONS } from "@/lib/constants";
import { searchDirectory } from "@/lib/directory";
import {
  getProfileByAmigoId,
  listDirectoryProfiles,
  listFriendRequests,
  listFriends,
  requestFriendship
} from "@/lib/supabase/queries";
import type { DirectoryResult, FriendRecord, FriendRequestRecord, Interest, UserProfile } from "@/lib/types";

export default function DiscoverPage() {
  const { loading, profile, session, supabase } = useAuth();
  const [directoryProfiles, setDirectoryProfiles] = useState<UserProfile[]>([]);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [requests, setRequests] = useState<FriendRequestRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedInterest, setSelectedInterest] = useState<Interest | "all">("all");
  const [onlyNotFriends, setOnlyNotFriends] = useState(true);
  const [idLookup, setIdLookup] = useState("");
  const [message, setMessage] = useState("");
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!session) {
      setDirectoryProfiles([]);
      setFriends([]);
      setRequests([]);
      return;
    }

    const userId = session.user.id;
    let active = true;

    async function loadData() {
      setLoadingData(true);

      try {
        const [profiles, friendList, requestList] = await Promise.all([
          listDirectoryProfiles(supabase, userId),
          listFriends(supabase, userId),
          listFriendRequests(supabase, userId)
        ]);

        if (!active) {
          return;
        }

        setDirectoryProfiles(profiles);
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

  const results = useMemo<DirectoryResult[]>(() => {
    if (!profile) {
      return [];
    }

    return searchDirectory(profile, directoryProfiles, {
      query,
      selectedInterest,
      onlyNotFriends,
      friendIds
    });
  }, [directoryProfiles, friendIds, onlyNotFriends, profile, query, selectedInterest]);

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

      await handleRequest(foundProfile);
      setIdLookup("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить заявку по ID.");
    }
  }

  if (!session && !loading) {
    return (
      <AppShell mode="plain" title="Поиск" description="">
        <section className="discover-plain-block stack-md">
          <h1 className="reference-sheet-heading">Поиск</h1>
          <p className="reference-sheet-copy">Войди в аккаунт, чтобы искать людей и отправлять заявки в друзья.</p>
          <Link className="button button-primary" href="/auth">
            Войти
          </Link>
        </section>
      </AppShell>
    );
  }

  if (!profile && !loading) {
    return (
      <AppShell mode="plain" title="Поиск" description="">
        <section className="discover-plain-block stack-md">
          <h1 className="reference-sheet-heading">Поиск</h1>
          <p className="reference-sheet-copy">Сначала заполни профиль, потом можно будет искать собеседников.</p>
          <Link className="button button-primary" href="/profile">
            Перейти к профилю
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell mode="plain" title="Поиск собеседника" description="">
      <section className="stack-xl">
        <div className="screen-heading-row">
          <div className="stack-xs">
            <h1 className="reference-sheet-heading">Поиск</h1>
            <p className="reference-sheet-copy">Ищи людей по интересам или добавляй напрямую по AmiGo ID.</p>
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
            <div className="panel-title">Фильтры</div>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Имя, интерес или описание"
              value={query}
            />

            <div className="tag-cloud">
              <button
                className={`tag tag-selectable ${selectedInterest === "all" ? "tag-selected" : ""}`}
                onClick={() => setSelectedInterest("all")}
                type="button"
              >
                Все интересы
              </button>
              {INTEREST_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`tag tag-selectable ${selectedInterest === option.value ? "tag-selected" : ""}`}
                  onClick={() => setSelectedInterest(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="checkbox-row">
              <input
                checked={onlyNotFriends}
                onChange={(event) => setOnlyNotFriends(event.target.checked)}
                type="checkbox"
              />
              <span>Скрывать тех, кто уже в друзьях</span>
            </label>
          </div>
        </section>

        <div className="row-between compact-row toolbar-row">
          <div className="status-strip">
            <span>{loadingData ? "Загружаем каталог..." : `${results.length} в подборке`}</span>
            <span>{requests.filter((item) => item.direction === "incoming").length} входящих заявок</span>
          </div>
        </div>

        {message ? <div className="toast-panel">{message}</div> : null}

        {results.length === 0 ? (
          <section className="discover-plain-block stack-md">
            <div className="panel-title">Пусто</div>
            <p className="reference-sheet-copy">Попробуй убрать часть фильтров или изменить запрос.</p>
          </section>
        ) : (
          <section className="cards-list">
            {results.map((result) => (
              <div key={result.profile.id} className="grid discover-grid directory-entry">
                <ProfileCard
                  hasPendingRequest={pendingRequestIds.includes(result.profile.id)}
                  isFriend={friendIds.includes(result.profile.id)}
                  onAddFriend={() => void handleRequest(result.profile)}
                  result={result}
                />
                <aside className="discover-plain-block directory-entry-reasons">
                  <div className="panel-title">Почему в подборке</div>
                  <ul className="bullet-list">
                    {result.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </aside>
              </div>
            ))}
          </section>
        )}
      </section>
    </AppShell>
  );
}
