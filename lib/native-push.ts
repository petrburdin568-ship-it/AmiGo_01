"use client";

import { Capacitor } from "@capacitor/core";

export type NativePushPermissionState = "granted" | "default" | "denied" | "unsupported";

export function isNativeAndroidApp() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function normalizePushPermissionState(status: string): NativePushPermissionState {
  if (status === "granted") {
    return "granted";
  }

  if (status === "denied") {
    return "denied";
  }

  return "default";
}

export async function getNativePushPermissionState(): Promise<NativePushPermissionState> {
  if (!isNativeAndroidApp()) {
    return "unsupported";
  }

  try {
    // @ts-ignore - Capacitor плагин доступен только в нативном приложении
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = await PushNotifications.checkPermissions();
    return normalizePushPermissionState(status.receive ?? "default");
  } catch {
    return "unsupported";
  }
}

export async function requestNativePushPermission(): Promise<NativePushPermissionState> {
  if (!isNativeAndroidApp()) {
    return "unsupported";
  }

  try {
    // @ts-ignore - Capacitor плагин доступен только в нативном приложении
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = await PushNotifications.requestPermissions();
    return normalizePushPermissionState(status.receive ?? "default");
  } catch {
    return "unsupported";
  }
}

export async function registerNativePushNotifications(): Promise<void> {
  if (!isNativeAndroidApp()) {
    return;
  }

  // @ts-ignore - Capacitor плагин доступен только в нативном приложении
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const status = await PushNotifications.checkPermissions();
  const permissionState = normalizePushPermissionState(status.receive ?? "default");

  if (permissionState !== "granted") {
    const requestStatus = await PushNotifications.requestPermissions();
    if (normalizePushPermissionState(requestStatus.receive ?? "default") !== "granted") {
      throw new Error("Push notifications permission denied.");
    }
  }

  await PushNotifications.register();
}

export async function addNativePushListeners(options: {
  onRegistration?: (token: string) => void;
  onRegistrationError?: (message: string) => void;
  onPushReceived?: (payload: unknown) => void;
  onAction?: (payload: unknown) => void;
}) {
  if (!isNativeAndroidApp()) {
    return () => undefined;
  }

  // @ts-ignore - Capacitor плагин доступен только в нативном приложении
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const listeners = [
    PushNotifications.addListener("registration", (token: any) => {
      options.onRegistration?.(token.value);
    }),
    PushNotifications.addListener("registrationError", (error: any) => {
      options.onRegistrationError?.(error?.message ?? String(error));
    }),
    PushNotifications.addListener("pushNotificationReceived", (notification: any) => {
      options.onPushReceived?.(notification);
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (action: any) => {
      options.onAction?.(action);
    })
  ];

  return () => {
    listeners.forEach((listener) => listener.remove());
  };
}
