import { getDefaultTitles, resolveActiveTitle } from "@/lib/title-system";
import type { Interest, UserProfile } from "@/lib/types";

type InitialProfileOptions = {
  name?: string;
  interests?: Interest[];
};

export function createInitialProfile(userId: string, options: InitialProfileOptions = {}): UserProfile {
  const titles = getDefaultTitles();

  return {
    id: userId,
    stateId: "",
    amigoId: "",
    name: options.name ?? "",
    age: 22,
    bio: "",
    avatar:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
    interests: options.interests ?? [],
    friendshipGoal: "casual-talk",
    communicationFormats: ["text-only"],
    personalityTags: [],
    icebreaker: "",
    availability: "late-evenings",
    titles,
    activeTitleId: titles[0]?.id ?? null,
    activeTitle: resolveActiveTitle(titles, titles[0]?.id ?? null),
    capabilityFlags: [],
    coinBalance: 0
  };
}
