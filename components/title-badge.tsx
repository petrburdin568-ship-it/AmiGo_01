import { getTitleWidgetMeta } from "@/lib/title-system";
import type { UserTitle } from "@/lib/types";

type TitleBadgeProps = {
  title: UserTitle;
  compact?: boolean;
};

export function TitleBadge({ title, compact = false }: TitleBadgeProps) {
  const { toneClass, categoryLabel } = getTitleWidgetMeta(title);

  return (
    <div className={`title-badge ${toneClass} ${compact ? "title-badge-compact" : ""}`}>
      <span className="title-badge-icon">{title.icon}</span>
      <span className="title-badge-copy">
        <strong>{title.text}</strong>
        {!compact ? <small>{categoryLabel}</small> : null}
      </span>
    </div>
  );
}
