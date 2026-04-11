"use client";

export type BuiltInCallRingtoneId = "soft-ping-loop" | "soft-ping-loop-alt";

export type CallRingtoneChoice =
  | {
      type: "builtin";
      id: BuiltInCallRingtoneId;
    }
  | {
      type: "custom";
    };

export type BuiltInCallRingtoneOption = {
  id: BuiltInCallRingtoneId;
  label: {
    ru: string;
    en: string;
  };
  description: {
    ru: string;
    en: string;
  };
  src: string;
};

type CallRingtoneSourceResult = {
  src: string;
  revoke?: () => void;
};

const CALL_RINGTONE_STORAGE_KEY = "amigo-call-ringtone-choice";
const CUSTOM_CALL_RINGTONE_NAME_KEY = "amigo-custom-call-ringtone-name";
const CUSTOM_CALL_RINGTONE_DB_NAME = "amigo-call-ringtone-db";
const CUSTOM_CALL_RINGTONE_STORE_NAME = "ringtones";
const CUSTOM_CALL_RINGTONE_RECORD_KEY = "custom";

export const CALL_RINGTONE_CHANGE_EVENT = "amigo-ringtone-change";

export const BUILT_IN_CALL_RINGTONES: BuiltInCallRingtoneOption[] = [
  {
    id: "soft-ping-loop",
    label: {
      ru: "Soft Ping Loop",
      en: "Soft Ping Loop"
    },
    description: {
      ru: "Мягкий базовый сигнал",
      en: "Soft default alert"
    },
    src: "/sounds/soft-ping-loop.mp3"
  },
  {
    id: "soft-ping-loop-alt",
    label: {
      ru: "Soft Ping Loop 2",
      en: "Soft Ping Loop 2"
    },
    description: {
      ru: "Более яркий альтернативный сигнал",
      en: "Brighter alternate alert"
    },
    src: "/sounds/soft-ping-loop-alt.mp3"
  }
];

export const DEFAULT_CALL_RINGTONE_ID: BuiltInCallRingtoneId = "soft-ping-loop";

function getDefaultCallRingtoneChoice(): CallRingtoneChoice {
  return {
    type: "builtin",
    id: DEFAULT_CALL_RINGTONE_ID
  };
}

function getBuiltInCallRingtone(id: BuiltInCallRingtoneId) {
  return BUILT_IN_CALL_RINGTONES.find((option) => option.id === id) ?? BUILT_IN_CALL_RINGTONES[0];
}

function openCustomCallRingtoneDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Хранилище рингтонов недоступно в этом браузере."));
      return;
    }

    const request = indexedDB.open(CUSTOM_CALL_RINGTONE_DB_NAME, 1);

    request.onerror = () => {
      reject(new Error("Не удалось открыть хранилище рингтонов."));
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CUSTOM_CALL_RINGTONE_STORE_NAME)) {
        database.createObjectStore(CUSTOM_CALL_RINGTONE_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function dispatchCallRingtoneChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(CALL_RINGTONE_CHANGE_EVENT));
}

export function getStoredCallRingtoneChoice(): CallRingtoneChoice {
  if (typeof window === "undefined") {
    return getDefaultCallRingtoneChoice();
  }

  const rawValue = window.localStorage.getItem(CALL_RINGTONE_STORAGE_KEY);
  if (!rawValue) {
    return getDefaultCallRingtoneChoice();
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<CallRingtoneChoice> & { id?: string };

    if (parsed.type === "custom") {
      return {
        type: "custom"
      };
    }

    if (
      parsed.type === "builtin" &&
      typeof parsed.id === "string" &&
      BUILT_IN_CALL_RINGTONES.some((option) => option.id === parsed.id)
    ) {
      return {
        type: "builtin",
        id: parsed.id as BuiltInCallRingtoneId
      };
    }
  } catch {
    return getDefaultCallRingtoneChoice();
  }

  return getDefaultCallRingtoneChoice();
}

export function setStoredCallRingtoneChoice(choice: CallRingtoneChoice) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CALL_RINGTONE_STORAGE_KEY, JSON.stringify(choice));
  dispatchCallRingtoneChanged();
}

export function getStoredCustomCallRingtoneName() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(CUSTOM_CALL_RINGTONE_NAME_KEY) ?? "";
}

function setStoredCustomCallRingtoneName(name: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CUSTOM_CALL_RINGTONE_NAME_KEY, name);
}

function clearStoredCustomCallRingtoneName() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(CUSTOM_CALL_RINGTONE_NAME_KEY);
}

export async function saveCustomCallRingtone(file: File) {
  const database = await openCustomCallRingtoneDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CUSTOM_CALL_RINGTONE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CUSTOM_CALL_RINGTONE_STORE_NAME);
    const request = store.put(file, CUSTOM_CALL_RINGTONE_RECORD_KEY);

    request.onerror = () => {
      reject(new Error("Не удалось сохранить ваш рингтон."));
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(new Error("Не удалось сохранить ваш рингтон."));
    };
  });

  setStoredCustomCallRingtoneName(file.name);
  dispatchCallRingtoneChanged();
}

export async function getCustomCallRingtoneBlob() {
  const database = await openCustomCallRingtoneDb();

  return new Promise<Blob | null>((resolve, reject) => {
    const transaction = database.transaction(CUSTOM_CALL_RINGTONE_STORE_NAME, "readonly");
    const store = transaction.objectStore(CUSTOM_CALL_RINGTONE_STORE_NAME);
    const request = store.get(CUSTOM_CALL_RINGTONE_RECORD_KEY);

    request.onerror = () => {
      reject(new Error("Не удалось прочитать пользовательский рингтон."));
    };

    request.onsuccess = () => {
      resolve((request.result as Blob | undefined) ?? null);
    };
  });
}

export async function hasCustomCallRingtone() {
  return Boolean(await getCustomCallRingtoneBlob());
}

export async function deleteCustomCallRingtone() {
  const database = await openCustomCallRingtoneDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CUSTOM_CALL_RINGTONE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CUSTOM_CALL_RINGTONE_STORE_NAME);
    const request = store.delete(CUSTOM_CALL_RINGTONE_RECORD_KEY);

    request.onerror = () => {
      reject(new Error("Не удалось удалить пользовательский рингтон."));
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(new Error("Не удалось удалить пользовательский рингтон."));
    };
  });

  clearStoredCustomCallRingtoneName();
  dispatchCallRingtoneChanged();
}

export async function resolveCallRingtoneSource(choice = getStoredCallRingtoneChoice()): Promise<CallRingtoneSourceResult> {
  if (choice.type === "builtin") {
    return {
      src: getBuiltInCallRingtone(choice.id).src
    };
  }

  try {
    const customBlob = await getCustomCallRingtoneBlob();
    if (!customBlob) {
      return {
        src: getBuiltInCallRingtone(DEFAULT_CALL_RINGTONE_ID).src
      };
    }

    const objectUrl = URL.createObjectURL(customBlob);

    return {
      src: objectUrl,
      revoke: () => URL.revokeObjectURL(objectUrl)
    };
  } catch {
    return {
      src: getBuiltInCallRingtone(DEFAULT_CALL_RINGTONE_ID).src
    };
  }
}
