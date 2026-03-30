export function generateAmigoId(name: string) {
  const slug = name
    .toUpperCase()
    .replace(/[^A-ZА-Я0-9]/g, "")
    .slice(0, 8) || "USER";

  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `AMG-${slug}-${suffix}`;
}
