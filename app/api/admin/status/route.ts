import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPermanentAdminUserId } from "@/lib/admin-access";
import { handleAdminOptions, resolveAdminSession, withAdminCors } from "@/lib/admin-api-server";

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

export function OPTIONS(request: Request) {
  return handleAdminOptions(request);
}

export async function GET(request: Request) {
  const userId = await resolveSessionUserId(request);
  if (!userId) {
    return withAdminCors(request, NextResponse.json({ unlocked: false }));
  }

  if (isPermanentAdminUserId(userId)) {
    return withAdminCors(request, NextResponse.json({ unlocked: true }));
  }

  const session = resolveAdminSession(request);

  return withAdminCors(
    request,
    NextResponse.json({
      unlocked: session?.userId === userId
    })
  );
}
