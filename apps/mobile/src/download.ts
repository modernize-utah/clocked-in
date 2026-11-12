import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

export async function saveTextFile(filename: string, text: string, mime = "text/csv") {
  if (Platform.OS === "web") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: "public.comma-separated-values-text" });
}
