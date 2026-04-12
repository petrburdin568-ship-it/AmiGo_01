"use client";

export type BrowserNotificationPermissionState = NotificationPermission | "unsupported";

type BrowserNotificationOptions = {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
};

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }

  return Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported" as const;
  }

  return Notification.requestPermission();
}

export function showBrowserNotification(options: BrowserNotificationOptions) {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return null;
  }

  if (Notification.permission !== "granted") {
    return null;
  }

  const notification = new Notification(options.title, {
    body: options.body,
    tag: options.tag
  });

  notification.onclick = () => {
    window.focus();
    options.onClick?.();
    notification.close();
  };

  return notification;
}
