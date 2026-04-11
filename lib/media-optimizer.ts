"use client";

const IMAGE_MAX_EDGE = 1600;
const IMAGE_QUALITY = 0.8;
const VIDEO_MAX_EDGE = 960;
const VIDEO_FRAME_RATE = 24;
const VIDEO_BITRATE = 1_200_000;
const VIDEO_AUDIO_BITRATE = 96_000;
const MIN_IMAGE_BYTES_FOR_COMPRESSION = 250 * 1024;
const MIN_VIDEO_BYTES_FOR_COMPRESSION = 2 * 1024 * 1024;

function replaceFileExtension(fileName: string, nextExtension: string) {
  const lastDotIndex = fileName.lastIndexOf(".");
  const normalizedExtension = nextExtension.replace(/^\./, "");

  if (lastDotIndex === -1) {
    return `${fileName}.${normalizedExtension}`;
  }

  return `${fileName.slice(0, lastDotIndex)}.${normalizedExtension}`;
}

function createObjectUrl(file: Blob) {
  return URL.createObjectURL(file);
}

function revokeObjectUrl(url: string) {
  URL.revokeObjectURL(url);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось прочитать изображение."));
    image.src = url;
  });
}

function loadVideo(url: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = true;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("Не удалось прочитать видео."));
    video.src = url;
  });
}

function getSupportedVideoMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return candidates.find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
}

function getCaptureStream(video: HTMLVideoElement) {
  const captureTarget = video as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
    webkitCaptureStream?: () => MediaStream;
  };

  return captureTarget.captureStream?.() ?? captureTarget.mozCaptureStream?.() ?? captureTarget.webkitCaptureStream?.() ?? null;
}

function toSizedDimension(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

async function compressImageFile(file: File) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }

  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }

  const objectUrl = createObjectUrl(file);

  try {
    const image = await loadImage(objectUrl);
    const largestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = largestEdge > IMAGE_MAX_EDGE ? IMAGE_MAX_EDGE / largestEdge : 1;

    if (scale === 1 && file.size < MIN_IMAGE_BYTES_FOR_COMPRESSION) {
      return file;
    }

    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const preferredType = file.type === "image/png" || file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const blob = await canvasToBlob(canvas, preferredType, IMAGE_QUALITY);

    if (!blob || blob.size >= file.size) {
      return file;
    }

    const extension = blob.type === "image/webp" ? "webp" : "jpg";

    return new File([blob], replaceFileExtension(file.name, extension), {
      type: blob.type,
      lastModified: Date.now()
    });
  } catch {
    return file;
  } finally {
    revokeObjectUrl(objectUrl);
  }
}

async function compressVideoFile(file: File) {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    return file;
  }

  const mimeType = getSupportedVideoMimeType();
  if (!mimeType) {
    return file;
  }

  const objectUrl = createObjectUrl(file);
  let animationFrameId = 0;
  let audioContext: AudioContext | null = null;
  let recorderStream: MediaStream | null = null;

  try {
    const video = await loadVideo(objectUrl);
    const largestEdge = Math.max(video.videoWidth, video.videoHeight);
    const scale = largestEdge > VIDEO_MAX_EDGE ? VIDEO_MAX_EDGE / largestEdge : 1;

    if (scale === 1 && file.size < MIN_VIDEO_BYTES_FOR_COMPRESSION) {
      return file;
    }

    const targetWidth = toSizedDimension(video.videoWidth * scale);
    const targetHeight = toSizedDimension(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context || typeof canvas.captureStream !== "function") {
      return file;
    }

    const canvasStream = canvas.captureStream(VIDEO_FRAME_RATE);
    recorderStream = canvasStream;

    try {
      audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaElementSource(video);
      const destinationNode = audioContext.createMediaStreamDestination();
      sourceNode.connect(destinationNode);
      destinationNode.stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
    } catch {
      const directStream = getCaptureStream(video);
      directStream?.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
      audioBitsPerSecond: VIDEO_AUDIO_BITRATE
    });

    const recordPromise = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => reject(new Error("Не удалось сжать видео."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    });

    const drawFrame = () => {
      context.drawImage(video, 0, 0, targetWidth, targetHeight);
      if (!video.paused && !video.ended) {
        animationFrameId = window.requestAnimationFrame(drawFrame);
      }
    };

    context.drawImage(video, 0, 0, targetWidth, targetHeight);
    recorder.start(250);
    await video.play();
    drawFrame();

    await new Promise<void>((resolve, reject) => {
      video.onended = () => resolve();
      video.onerror = () => reject(new Error("Не удалось воспроизвести видео для сжатия."));
    });

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    const blob = await recordPromise;

    if (blob.size <= 0 || blob.size >= file.size) {
      return file;
    }

    const extension = blob.type.includes("mp4") ? "mp4" : "webm";

    return new File([blob], replaceFileExtension(file.name, extension), {
      type: blob.type,
      lastModified: Date.now()
    });
  } catch {
    return file;
  } finally {
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
    }

    recorderStream?.getTracks().forEach((track) => track.stop());
    await audioContext?.close().catch(() => undefined);
    revokeObjectUrl(objectUrl);
  }
}

export async function optimizeImageForUpload(file: File) {
  return compressImageFile(file);
}

export async function optimizeVideoForUpload(file: File) {
  return compressVideoFile(file);
}
