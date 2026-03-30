import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RequestPayload = {
  email?: string;
  password?: string;
  inviteCode?: string;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RequestPayload;
    const email = payload.email?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";
    const inviteCode = payload.inviteCode?.trim().toUpperCase() ?? "";

    if (!email || !password || !inviteCode) {
      return NextResponse.json({ error: "Email, password and invite code are required." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters long." }, { status: 400 });
    }

    const admin = getAdminClient();

    const { data: createdUserData, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createError || !createdUserData.user) {
      return NextResponse.json({ error: createError?.message ?? "Failed to create account." }, { status: 400 });
    }

    const userId = createdUserData.user.id;

    const { error: consumeError } = await admin.rpc("consume_alpha_invite", {
      invite_code: inviteCode,
      target_user: userId,
      target_email: email
    });

    if (consumeError) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: consumeError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected registration error." },
      { status: 500 }
    );
  }
}
