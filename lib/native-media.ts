"use client";

import { Capacitor } from "@capacitor/core";
import { Camera, MediaType, MediaTypeSelection } from "@capacitor/camera";

function normalizeMimeType(format?: string, fallbackType?: string) {
  const normalizedFormat = (format ?? "").toLowerCase();

  if (normalizedFormat === "jpg" || normalizedFormat === "jpeg") {
    return "image/jpeg";
  }

  if (normalizedFormat === "png") {
    return "image/png";
  }

  if (normalizedFormat === "webp") {
    return "image/webp";
  }

  if (normalizedFormat === "mp4") {
    return "video/mp4";
  }

  if (normalizedFormat === "webm") {
    return "video/webm";
  }

  if (normalizedFormat === "mov") {
    return "video/quicktime";
  }

  if (fallbackType?.startsWith("image/") || fallbackType?.startsWith("video/")) {
    return fallbackType;
  }

  return "image/jpeg";
}

function getFileExtension(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  if (mimeType === "video/mp4") {
    return "mp4";
  }

  if (mimeType === "video/webm") {
    return "webm";
  }

  if (mimeType === "video/quicktime") {
    return "mov";
  }

  return "jpg";
}

async function webPathToFile(webPath: string, format?: string, fallbackType?: string, baseName = "media") {
  const response = await fetch(webPath);
  if (!response.ok) {
    throw new Error("Не удалось прочитать выбранный файл с устройства.");
  }

  const blob = await response.blob();
  const mimeType = normalizeMimeType(format, blob.type || fallbackType);
  const extension = getFileExtension(mimeType);

  return new File([blob], `${baseName}-${Date.now()}.${extension}`, {
    type: mimeType,
    lastModified: Date.now()
  });
}

export function isNativeAndroidApp() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function isNativeMediaCancelledError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel/i.test(message);
}

export async function pickNativeAndroidMediaFile() {
  if (!isNativeAndroidApp()) {
    return null;
  }

  const permissions = await Camera.requestPermissions({
    permissions: ["camera", "photos"]
  });

  if (permissions.camera === "denied" || permissions.photos === "denied") {
    throw new Error("Разреши доступ к камере и медиафайлам, чтобы отправлять вложения из приложения.");
  }

  const media = await Camera.chooseFromGallery({
    mediaType: MediaTypeSelection.All,
    allowMultipleSelection: false,
    quality: 90,
    targetWidth: 1600,
    targetHeight: 1600,
    correctOrientation: true
  });

  const selectedMedia = media.results[0];
  if (!selectedMedia?.webPath) {
    throw new Error("Не удалось получить выбранный файл с устройства.");
  }

  if (selectedMedia.type === MediaType.Video) {
    return webPathToFile(selectedMedia.webPath, selectedMedia.metadata?.format, "video/mp4", "video");
  }

  return webPathToFile(selectedMedia.webPath, selectedMedia.metadata?.format, "image/jpeg", "photo");
}
