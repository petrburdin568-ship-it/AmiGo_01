"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";

type UserAvatarProps = {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "A";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserAvatar({
  name,
  src,
  size = "md",
  className = ""
}: UserAvatarProps) {
  const initials = getInitials(name);
  const classes = ["user-avatar", `user-avatar-${size}`, className].filter(Boolean).join(" ");
  const [hasLoadError, setHasLoadError] = useState(false);
  const avatarSrc = src?.trim();

  useEffect(() => {
    setHasLoadError(false);
  }, [avatarSrc]);

  return (
    <div aria-label={name} className={classes} role="img">
      {avatarSrc && !hasLoadError ? (
        <img
          alt={name}
          className="user-avatar-image"
          loading="lazy"
          onError={() => setHasLoadError(true)}
          src={avatarSrc}
        />
      ) : (
        <span className="user-avatar-fallback">{initials}</span>
      )}
      <div className="user-avatar-ring" />
    </div>
  );
}
