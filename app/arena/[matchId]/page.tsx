"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { UserAvatar } from "@/components/user-avatar";
import { useAuth } from "@/components/auth-provider";
import {
  getArenaMatch,
  getFriendshipDetails,
  performArenaAction,
  saveArenaLoadout
} from "@/lib/supabase/queries";
import type { ArenaAction, ArenaAppearance, ArenaMatch, ArenaWeapon, FriendRecord } from "@/lib/types";

const APPEARANCES: { value: ArenaAppearance; label: string; icon: string }[] = [
  { value: "centurion", label: "Centurion", icon: "⚔" },
  { value: "hoplite", label: "Hoplite", icon: "🛡" },
  { value: "knight", label: "Knight", icon: "♞" },
  { value: "raider", label: "Raider", icon: "☠" }
];

const WEAPONS: { value: ArenaWeapon; label: string }[] = [
  { value: "gladius", label: "Gladius" },
  { value: "spear", label: "Spear" },
  { value: "axe", label: "Axe" },
  { value: "longsword", label: "Longsword" }
];

const ACTIONS: { value: ArenaAction; label: string; note: string }[] = [
  { value: "quick", label: "Quick strike", note: "Fast and consistent damage." },
  { value: "heavy", label: "Heavy strike", note: "Higher damage, slower feel." },
  { value: "guard", label: "Guard", note: "Reduce the next incoming hit." }
];

function getAppearanceMeta(value: ArenaAppearance | null) {
  return APPEARANCES.find((item) => item.value === value) ?? APPEARANCES[0];
}

function getWeaponLabel(value: ArenaWeapon | null) {
  return WEAPONS.find((item) => item.value === value)?.label ?? "Unarmed";
}

export default function ArenaPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = typeof params.matchId === "string" ? params.matchId : "";
  const { loading, session, supabase } = useAuth();
  const [match, setMatch] = useState<ArenaMatch | null>(null);
  const [friend, setFriend] = useState<FriendRecord | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [appearance, setAppearance] = useState<ArenaAppearance>("centurion");
  const [weapon, setWeapon] = useState<ArenaWeapon>("gladius");

  useEffect(() => {
    if (!session || !matchId) {
      setMatch(null);
      setFriend(null);
      return;
    }

    const currentUserId = session.user.id;
    let active = true;

    async function loadArena() {
      try {
        const nextMatch = await getArenaMatch(supabase, matchId);
        if (!active) {
          return;
        }

        if (!nextMatch) {
          setMatch(null);
          setFriend(null);
          return;
        }

        setMatch(nextMatch);

        const nextFriend = await getFriendshipDetails(supabase, currentUserId, nextMatch.friendshipId);
        if (!active) {
          return;
        }

        setFriend(nextFriend);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Failed to load arena.");
        }
      }
    }

    void loadArena();

    const channel: RealtimeChannel = supabase
      .channel(`arena-match:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "arena_matches",
          filter: `id=eq.${matchId}`
        },
        () => {
          void loadArena();
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [matchId, session, supabase]);

  const isPlayerOne = useMemo(() => match?.playerOneId === session?.user.id, [match, session]);
  const myReady = isPlayerOne ? match?.playerOneReady : match?.playerTwoReady;
  const opponentReady = isPlayerOne ? match?.playerTwoReady : match?.playerOneReady;
  const myHp = isPlayerOne ? match?.playerOneHp : match?.playerTwoHp;
  const opponentHp = isPlayerOne ? match?.playerTwoHp : match?.playerOneHp;
  const myAppearance = getAppearanceMeta(
    isPlayerOne ? match?.playerOneAppearance ?? appearance : match?.playerTwoAppearance ?? appearance
  );
  const opponentAppearance = getAppearanceMeta(
    isPlayerOne ? (match?.playerTwoAppearance ?? null) : (match?.playerOneAppearance ?? null)
  );
  const myWeapon = isPlayerOne ? match?.playerOneWeapon ?? weapon : match?.playerTwoWeapon ?? weapon;
  const opponentWeapon = isPlayerOne ? (match?.playerTwoWeapon ?? null) : (match?.playerOneWeapon ?? null);
  const myTurn = match?.currentTurnUserId === session?.user.id;
  const winnerIsMe = match?.winnerUserId === session?.user.id;

  useEffect(() => {
    if (!match) {
      return;
    }

    if (isPlayerOne) {
      setAppearance(match.playerOneAppearance ?? "centurion");
      setWeapon(match.playerOneWeapon ?? "gladius");
      return;
    }

    setAppearance(match.playerTwoAppearance ?? "centurion");
    setWeapon(match.playerTwoWeapon ?? "gladius");
  }, [isPlayerOne, match]);

  async function handleSaveLoadout() {
    if (!match) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const nextMatch = await saveArenaLoadout(supabase, match.id, appearance, weapon);
      setMatch(nextMatch);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save fighter.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArenaAction(nextAction: ArenaAction) {
    if (!match) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const nextMatch = await performArenaAction(supabase, match.id, nextAction);
      setMatch(nextMatch);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to make arena move.");
    } finally {
      setBusy(false);
    }
  }

  if (!session && !loading) {
    return (
      <AppShell mode="plain" title="Arena" description="">
        <section className="stack-lg">
          <div className="reference-bottom-action reference-bottom-action-left">
            <Link className="button button-primary" href="/auth">
              Sign in
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  if (!match) {
    return (
      <AppShell mode="plain" title="Arena" description="">
        <section className="stack-lg">
          {message ? <div className="reference-sheet-message">{message}</div> : null}
          <div className="reference-bottom-action reference-bottom-action-left">
            <Link className="button button-primary" href="/chats">
              Back to chats
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell mode="plain" title="Arena" description="">
      <section className="arena-page">
        <div className="arena-topbar">
          <Link className="tg-chatbar-back" href={`/chats/${match.friendshipId}`}>
            Back to chat
          </Link>
          <span className="arena-topbar-status">
            {match.status === "setup" ? "Preparation" : match.status === "active" ? (myTurn ? "Your turn" : "Opponent turn") : winnerIsMe ? "Victory" : "Defeat"}
          </span>
        </div>

        {message ? <div className="toast-panel tg-chat-toast">{message}</div> : null}

        <div className="arena-board">
          <div className="arena-fighter arena-fighter-self">
            <div className="arena-fighter-head">
              <UserAvatar name={session?.user.email ?? "You"} size="sm" src={session?.user.user_metadata?.avatar_url as string | undefined} />
              <div>
                <strong>You</strong>
                <span>{myAppearance.label}</span>
              </div>
            </div>
            <div className="arena-fighter-visual">{myAppearance.icon}</div>
            <div className="arena-hp">
              <span>HP</span>
              <div className="arena-hp-track">
                <div className="arena-hp-fill" style={{ width: `${Math.max(0, Math.min(100, myHp ?? 0))}%` }} />
              </div>
              <strong>{myHp ?? 0}</strong>
            </div>
            <div className="arena-fighter-meta">{getWeaponLabel(myWeapon)}</div>
          </div>

          <div className="arena-fighter arena-fighter-opponent">
            <div className="arena-fighter-head">
              <UserAvatar name={friend?.profile.name ?? "Opponent"} size="sm" src={friend?.profile.avatar} />
              <div>
                <strong>{friend?.profile.name ?? "Opponent"}</strong>
                <span>{opponentAppearance.label}</span>
              </div>
            </div>
            <div className="arena-fighter-visual">{opponentAppearance.icon}</div>
            <div className="arena-hp">
              <span>HP</span>
              <div className="arena-hp-track">
                <div className="arena-hp-fill" style={{ width: `${Math.max(0, Math.min(100, opponentHp ?? 0))}%` }} />
              </div>
              <strong>{opponentHp ?? 0}</strong>
            </div>
            <div className="arena-fighter-meta">{getWeaponLabel(opponentWeapon)}</div>
          </div>
        </div>

        {match.status === "setup" ? (
          <div className="arena-setup">
            <div className="arena-setup-copy">
              <h1>Prepare your fighter</h1>
              <p>Choose appearance and weapon. The duel starts as soon as both players are ready.</p>
            </div>

            <div className="arena-setup-grid">
              <div className="arena-setup-block">
                <span>Appearance</span>
                <div className="arena-chip-grid">
                  {APPEARANCES.map((item) => (
                    <button
                      key={item.value}
                      className={`arena-choice ${appearance === item.value ? "arena-choice-active" : ""}`}
                      onClick={() => setAppearance(item.value)}
                      type="button"
                    >
                      <strong>{item.icon}</strong>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="arena-setup-block">
                <span>Weapon</span>
                <div className="arena-chip-grid arena-chip-grid-compact">
                  {WEAPONS.map((item) => (
                    <button
                      key={item.value}
                      className={`arena-choice ${weapon === item.value ? "arena-choice-active" : ""}`}
                      onClick={() => setWeapon(item.value)}
                      type="button"
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="arena-ready-strip">
              <span>{myReady ? "You are ready." : "You are not ready yet."}</span>
              <span>{opponentReady ? "Opponent is ready." : "Opponent is still preparing."}</span>
            </div>

            <button className="button button-primary arena-ready-button" disabled={busy} onClick={() => void handleSaveLoadout()} type="button">
              {busy ? "Saving..." : myReady ? "Update loadout" : "Ready for battle"}
            </button>
          </div>
        ) : null}

        {match.status === "active" ? (
          <div className="arena-fight">
            <div className="arena-action-grid">
              {ACTIONS.map((item) => (
                <button
                  key={item.value}
                  className={`arena-action-card ${item.value === "guard" ? "arena-action-card-muted" : ""}`}
                  disabled={busy || !myTurn}
                  onClick={() => void handleArenaAction(item.value)}
                  type="button"
                >
                  <strong>{item.label}</strong>
                  <span>{item.note}</span>
                </button>
              ))}
            </div>

            <div className="arena-log">
              <div className="arena-log-head">
                <strong>Combat log</strong>
                <span>{myTurn ? "Make your move." : "Waiting for the opponent."}</span>
              </div>
              <div className="arena-log-list">
                {match.log.map((entry, index) => (
                  <article key={`${entry.createdAt}-${index}`} className="arena-log-row">
                    <strong>{entry.actorName}</strong>
                    <p>{entry.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {match.status === "finished" ? (
          <div className="arena-finish">
            <h1>{winnerIsMe ? "You won the duel" : `${friend?.profile.name ?? "Opponent"} won the duel`}</h1>
            <p>Open the chat to start another round or send a new arena challenge.</p>
            <Link className="button button-primary" href={`/chats/${match.friendshipId}`}>
              Return to chat
            </Link>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
