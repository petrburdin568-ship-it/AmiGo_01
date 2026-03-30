const PERMANENT_ADMIN_USER_IDS = new Set<string>([
  "7ae5180a-371c-42e1-9b35-d442f8e22721"
]);

export function isPermanentAdminUserId(userId: string | null | undefined) {
  return Boolean(userId && PERMANENT_ADMIN_USER_IDS.has(userId));
}
