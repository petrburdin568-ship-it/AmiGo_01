type SelectorOption<T extends string> = {
  value: T;
  label: string;
};

type TagSelectorProps<T extends string> = {
  options: SelectorOption<T>[];
  selected: T[];
  onToggle: (value: T) => void;
};

export function TagSelector<T extends string>({
  options,
  selected,
  onToggle
}: TagSelectorProps<T>) {
  return (
    <div className="tag-cloud">
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            className={`tag tag-selectable ${active ? "tag-selected" : ""}`}
            onClick={() => onToggle(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
