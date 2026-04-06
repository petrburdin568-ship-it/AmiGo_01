import { getTitleWidgetMeta } from "@/lib/title-system";
import type { UserTitle } from "@/lib/types";

type TitleBadgeProps = {
  title: UserTitle;
  compact?: boolean;
};

export function TitleBadge({ title, compact = false }: TitleBadgeProps) {
  const { toneClass, categoryLabel, description, acquiredAtLabel } = getTitleWidgetMeta(title);

  return (
    <div className="title-badge-wrap">
      <div className={`title-badge ${toneClass} ${compact ? "title-badge-compact" : ""}`}>
        <span className="title-badge-copy">
          <strong>{title.text}</strong>
        </span>
      </div>

      <div className="title-badge-tooltip" role="note">
        <strong>{title.text}</strong>
        <span>{categoryLabel}</span>
        <span>Появился: {acquiredAtLabel}</span>
        <p>{description}</p>
        {title.grantedBy ? <span>Выдан вручную администратором.</span> : null}
      </div>
    </div>
  );
}
