export type StickerOption = {
  id: string;
  emoji: string;
  label: string;
};

export const STICKER_OPTIONS: StickerOption[] = [
  { id: "spark-love", emoji: "💛", label: "Тепло" },
  { id: "cool-star", emoji: "😎", label: "Круто" },
  { id: "joy-burst", emoji: "😂", label: "Смех" },
  { id: "fire-win", emoji: "🔥", label: "Огонь" },
  { id: "party-pop", emoji: "🥳", label: "Праздник" },
  { id: "wow-shock", emoji: "😮", label: "Вау" },
  { id: "sleepy-mood", emoji: "😴", label: "Сон" },
  { id: "cat-wave", emoji: "🐱", label: "Кот" },
  { id: "rocket-go", emoji: "🚀", label: "Полетели" },
  { id: "clap-win", emoji: "👏", label: "Браво" },
  { id: "pixel-heart", emoji: "🫶", label: "Поддержка" },
  { id: "lucky-spark", emoji: "✨", label: "Искры" }
];

export function getStickerByValue(value: string) {
  return STICKER_OPTIONS.find((item) => item.id === value || item.emoji === value) ?? null;
}
