import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const memory = new Map<string, string>();

export async function readSecret(key: string) {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(key) ?? memory.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export async function writeSecret(key: string, value: string) {
  if (Platform.OS === "web") {
    memory.set(key, value);
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecret(key: string) {
  if (Platform.OS === "web") {
    memory.delete(key);
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
