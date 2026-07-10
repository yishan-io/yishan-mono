import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

function isWebStorageAvailable(): boolean {
  return Platform.OS === "web" && typeof globalThis.localStorage !== "undefined";
}

export async function getStoredValue(key: string): Promise<string | null> {
  if (isWebStorageAvailable()) {
    return globalThis.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  if (isWebStorageAvailable()) {
    globalThis.localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function deleteStoredValue(key: string): Promise<void> {
  if (isWebStorageAvailable()) {
    globalThis.localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function getSecureStoredValue(key: string): Promise<string | null> {
  if (isWebStorageAvailable()) {
    return globalThis.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

export async function setSecureStoredValue(key: string, value: string): Promise<void> {
  if (isWebStorageAvailable()) {
    globalThis.localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecureStoredValue(key: string): Promise<void> {
  if (isWebStorageAvailable()) {
    globalThis.localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}
