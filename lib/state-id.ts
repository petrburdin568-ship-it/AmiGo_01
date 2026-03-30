export function generateStateId() {
  const numeric = Math.floor(100000000 + Math.random() * 900000000);
  return String(numeric);
}
