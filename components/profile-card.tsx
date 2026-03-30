import { TitleBadge } from "@/components/title-badge";
import { UserAvatar } from "@/components/user-avatar";
import { getInterestLabels } from "@/lib/constants";
import type { DirectoryResult } from "@/lib/types";

type ProfileCardProps = {
  result: DirectoryResult;
  isFriend: boolean;
  hasPendingRequest: boolean;
  onAddFriend: () => void;
};

export function ProfileCard({ result, isFriend, hasPendingRequest, onAddFriend }: ProfileCardProps) {
  const { profile, score } = result;

  return (
    <article className="directory-card discover-card-plain">
      <div className="directory-card-head">
        <UserAvatar className="directory-card-avatar" name={profile.name} size="lg" src={profile.avatar} />

        <div className="directory-card-copy">
          <div className="directory-card-title">
            <div>
              <h2>
                {profile.name}, {profile.age}
              </h2>
              <p>{profile.bio}</p>
            </div>
            <span className="directory-card-score">{score}</span>
          </div>

          <div className="directory-card-meta">
            <TitleBadge compact title={profile.activeTitle} />
            <span className="pill-highlight">{profile.amigoId}</span>
          </div>
        </div>
      </div>

      <div className="tag-cloud">
        {getInterestLabels(profile.interests).map((label) => (
          <span key={label} className="tag">
            {label}
          </span>
        ))}
      </div>

      <div className="directory-card-actions">
        <button
          className={`button ${isFriend || hasPendingRequest ? "button-secondary" : "button-primary"}`}
          disabled={isFriend || hasPendingRequest}
          onClick={onAddFriend}
          type="button"
        >
          {isFriend ? "Уже в друзьях" : hasPendingRequest ? "Заявка отправлена" : "Отправить заявку"}
        </button>
      </div>
    </article>
  );
}
