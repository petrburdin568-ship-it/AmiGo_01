import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPermanentAdminUserId } from "@/lib/admin-access";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-session";
import { ADMIN_TITLE_ID, normalizeTitles } from "@/lib/title-system";
import type { TitleTone, UserTitle } from "@/lib/types";

async function resolveSessionUserId(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

export async function POST(request: Request) {
  const requesterId = await resolveSessionUserId(request);
  if (!requesterId) {
    return NextResponse.json({ ok: false, message: "Нужна активная сессия." }, { status: 401 });
  }

  const adminToken = cookies().get(getAdminCookieName())?.value;
  const adminSession = verifyAdminSessionToken(adminToken);
  const hasTemporaryAdminSession = adminSession?.userId === requesterId;
  const hasPermanentAdminAccess = isPermanentAdminUserId(requesterId);

  if (!hasTemporaryAdminSession && !hasPermanentAdminAccess) {
    return NextResponse.json({ ok: false, message: "Админ-доступ не подтверждён." }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    return NextResponse.json(
      {
        ok: false,
        message: "Для выдачи титулов нужен SUPABASE_SERVICE_ROLE_KEY в .env.local."
      },
      { status: 500 }
    );
  }

  const body = (await request.json()) as {
    amigoId?: string;
    titleText?: string;
    reason?: string;
    tone?: TitleTone;
  };

  const amigoId = body.amigoId?.trim().toUpperCase();
  const titleText = body.titleText?.trim();
  const reason = body.reason?.trim() || "Выдан администратором вручную.";
  const tone = body.tone ?? "gold";

  if (!amigoId || !titleText) {
    return NextResponse.json({ ok: false, message: "Укажи AmiGo ID и текст титула." }, { status: 400 });
  }

  if (titleText.length > 48) {
    return NextResponse.json({ ok: false, message: "Титул слишком длинный." }, { status: 400 });
  }

  if (reason.length > 220) {
    return NextResponse.json({ ok: false, message: "Описание титула слишком длинное." }, { status: 400 });
  }

  const adminClient = createClient(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data: target, error: targetError } = await adminClient
    .from("profiles")
    .select("id,name,amigo_id,titles,active_title_id")
    .eq("amigo_id", amigoId)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ ok: false, message: targetError.message }, { status: 500 });
  }

  if (!target) {
    return NextResponse.json({ ok: false, message: "Пользователь с таким AmiGo ID не найден." }, { status: 404 });
  }

  const titles = normalizeTitles(target.titles);
  const nextAdminTitle: UserTitle = {
    id: ADMIN_TITLE_ID,
    text: titleText,
    category: "admin",
    icon: "ADM",
    tone,
    locked: true,
    grantedBy: requesterId,
    description: reason,
    acquiredAt: new Date().toISOString()
  };

  const nextTitles = [...titles.filter((title) => title.id !== ADMIN_TITLE_ID), nextAdminTitle];
  const activeTitleId =
    typeof target.active_title_id === "string" && nextTitles.some((title) => title.id === target.active_title_id)
      ? target.active_title_id
      : nextTitles[0]?.id ?? null;

  const { data: updatedProfile, error } = await adminClient
    .from("profiles")
    .update({
      titles: nextTitles,
      active_title_id: activeTitleId
    })
    .eq("id", target.id)
    .select("id,titles")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const confirmedTitles = normalizeTitles(updatedProfile?.titles);
  const confirmedAdminTitle = confirmedTitles.find((title) => title.id === ADMIN_TITLE_ID);
  if (!confirmedAdminTitle || confirmedAdminTitle.text !== titleText) {
    return NextResponse.json({ ok: false, message: "База не подтвердила обновление титула." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: `Титул выдан пользователю ${target.name}.`
  });
}
