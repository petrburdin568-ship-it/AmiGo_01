import { getInterestLabels } from "@/lib/constants";
import type { DirectoryResult, Interest, UserProfile } from "@/lib/types";

export type DirectoryFilters = {
  query: string;
  selectedInterest: Interest | "all";
  onlyNotFriends: boolean;
  friendIds: string[];
};

function intersect<T>(left: T[], right: T[]) {
  return left.filter((item) => right.includes(item));
}

function includesQuery(profile: UserProfile, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [profile.name, profile.amigoId, profile.bio, ...getInterestLabels(profile.interests)]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function scoreProfile(currentUser: UserProfile, candidate: UserProfile): DirectoryResult {
  const sharedInterests = intersect(currentUser.interests, candidate.interests);
  const ageDifference = Math.abs(currentUser.age - candidate.age);

  let score = sharedInterests.length * 4;
  const reasons: string[] = [];

  if (sharedInterests.length > 0) {
    reasons.push(`Совпадают интересы: ${getInterestLabels(sharedInterests).join(", ")}.`);
  }

  if (ageDifference <= 2) {
    score += 2;
    reasons.push("Возраст близкий, поэтому общение может начаться проще.");
  }

  if (!candidate.bio.trim()) {
    score -= 1;
  } else {
    reasons.push("Профиль заполнен и есть описание.");
  }

  return {
    profile: candidate,
    score,
    reasons
  };
}

export function searchDirectory(
  currentUser: UserProfile,
  candidates: UserProfile[],
  filters: DirectoryFilters
) {
  return candidates
    .filter((candidate) => candidate.id !== currentUser.id)
    .filter((candidate) => (filters.selectedInterest === "all" ? true : candidate.interests.includes(filters.selectedInterest)))
    .filter((candidate) => includesQuery(candidate, filters.query))
    .filter((candidate) => (filters.onlyNotFriends ? !filters.friendIds.includes(candidate.id) : true))
    .map((candidate) => scoreProfile(currentUser, candidate))
    .sort((left, right) => right.score - left.score);
}
