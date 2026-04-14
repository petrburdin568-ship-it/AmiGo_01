import type { CommunicationFormat, FriendshipGoal, PersonalityTag } from "@/lib/types";

type Option<T extends string> = {
  value: T;
  label: string;
};

export const FRIENDSHIP_GOAL_OPTIONS: Option<FriendshipGoal>[] = [
  { value: "casual-talk", label: "Просто общение" },
  { value: "deep-friendship", label: "Найти близкого друга" },
  { value: "free-time-company", label: "Общение в свободное время" },
  { value: "shared-hobbies-online", label: "Совместные хобби онлайн" }
];

export const COMMUNICATION_FORMAT_OPTIONS: Option<CommunicationFormat>[] = [
  { value: "text-only", label: "Только переписка" },
  { value: "text-and-voice", label: "Переписка + голос" },
  { value: "sometimes-calls", label: "Иногда созвоны" },
  { value: "not-daily", label: "Не обязательно каждый день" },
  { value: "active-chat", label: "Люблю активное общение" }
];

export const PERSONALITY_TAG_OPTIONS: Option<PersonalityTag>[] = [
  { value: "calm", label: "Спокойный" },
  { value: "social", label: "Общительный" },
  { value: "introvert", label: "Интроверт" },
  { value: "extrovert", label: "Экстраверт" },
  { value: "funny", label: "С чувством юмора" },
  { value: "deep-talks", label: "Люблю глубокие разговоры" },
  { value: "light-talks", label: "Люблю лёгкое общение" }
];

function makeLabelMap<T extends string>(options: Option<T>[]) {
  return options.reduce<Record<T, string>>((accumulator, option) => {
    accumulator[option.value] = option.label;
    return accumulator;
  }, {} as Record<T, string>);
}

const goalLabelMap = makeLabelMap(FRIENDSHIP_GOAL_OPTIONS);
const communicationLabelMap = makeLabelMap(COMMUNICATION_FORMAT_OPTIONS);
const personalityLabelMap = makeLabelMap(PERSONALITY_TAG_OPTIONS);
const availabilityLabelMap = {
  "slow-replies": "Спокойный темп",
  "active-now": "Любит быть на связи",
  "late-evenings": "Чаще пишет вечером"
} as const;

export function getGoalLabel(value: FriendshipGoal) {
  return goalLabelMap[value];
}

export function getCommunicationFormatLabels(values: CommunicationFormat[]) {
  return values.map((value) => communicationLabelMap[value]);
}

export function getPersonalityLabels(values: PersonalityTag[]) {
  return values.map((value) => personalityLabelMap[value]);
}

export function getAvailabilityLabel(value: keyof typeof availabilityLabelMap) {
  return availabilityLabelMap[value];
}
