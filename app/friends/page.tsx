"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { UserAvatar } from "@/components/user-avatar";
import { getInterestLabels } from "@/lib/constants";
import { listFriends } from "@/lib/supabase/queries";
import type { FriendRecord } from "@/lib/types";

export default function FriendsPage() {
  const { loading, session, supabase } = useAuth();
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!session) {
      setFriends([]);
      return;
    }

    const currentUserId = session.user.id;
    let active = true;

    async function loadFriends() {
      try {
        const friendList = await listFriends(supabase, currentUserId);
        if (active) {
          setFriends(friendList);
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Не удалось загрузить друзей.");
        }
      }
    }

    void loadFriends();

    return () => {
      active = false;
    };
  }, [session, supabase]);

  const filteredFriends = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return friends;
    }

    return friends.filter((friend) =>
      [friend.profile.name, friend.profile.bio, friend.profile.amigoId, ...getInterestLabels(friend.profile.interests)]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [friends, query]);

  if (!session && !loading) {
    return (
      <AppShell mode="plain" title="Друзья" description="">
        <section className="reference-sheet dialog-sheet stack-lg">
          <div className="reference-sheet-top">
            <span className="reference-brand-label">AmiGo</span>
          </div>

          <div className="reference-empty">
            <p>Нужен вход, чтобы открыть друзей.</p>
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
    <AppShell mode="plain" title="Друзья" description="">
      <section className="reference-sheet dialog-sheet stack-lg">
        <div className="reference-sheet-top">
          <span className="reference-brand-label">AmiGo</span>
        </div>

        {message ? <div className="reference-sheet-message">{message}</div> : null}

        <div className="reference-sheet-block stack-sm">
          <h1 className="reference-sheet-heading">Друзья</h1>
          <input
            className="reference-search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по друзьям"
            value={query}
          />
        </div>

        {filteredFriends.length === 0 ? (
          <div className="reference-empty reference-empty-compact">
            <p>{friends.length === 0 ? "Друзья появятся после принятия заявок." : "Поиск по друзьям пустой."}</p>
          </div>
        ) : (
          <div className="reference-dialog-list reference-dialog-list-sheet">
            {filteredFriends.map((friend) => (
              <article key={friend.friendshipId} className="reference-dialog-row reference-dialog-row-sheet">
                <Link className="reference-dialog-avatar" href={`/friends/${friend.friendshipId}`}>
                  <UserAvatar name={friend.profile.name} size="sm" src={friend.profile.avatar} />
                </Link>

                <Link className="reference-dialog-main" href={`/friends/${friend.friendshipId}`}>
                  <div className="reference-dialog-top">
                    <strong>{friend.profile.name}</strong>
                    <span>{friend.profile.amigoId}</span>
                  </div>
                  <p>{friend.profile.bio}</p>
                </Link>

                <Link className="reference-dialog-side" href={`/chats/${friend.friendshipId}`}>
                  Чат
                </Link>
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
