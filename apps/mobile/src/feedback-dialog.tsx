import * as ImagePicker from "expo-image-picker";
import { MessageSquareIcon } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { api } from "@/api/client";
import { Button, ErrorText, Field, IconButton, Select, Sheet } from "@/ui";
import { useWorkspace } from "@/workspace";

const types = [
  { value: "Bug", label: "Bug" },
  { value: "Feature", label: "Feature request" },
];
const priorities = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Urgent", label: "Urgent" },
];
const areas = [
  { value: "Dashboard", label: "Dashboard" },
  { value: "LogTime", label: "Log time" },
  { value: "Entries", label: "Entries" },
  { value: "Reports", label: "Reports" },
  { value: "Settings", label: "Settings" },
  { value: "Other", label: "Other" },
];

export function FeedbackButton() {
  const { organization } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("Bug");
  const [priority, setPriority] = useState("Medium");
  const [area, setArea] = useState("Other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <>
      <IconButton icon={MessageSquareIcon} label="Send feedback" onPress={() => setOpen(true)} />
      <Sheet onClose={() => setOpen(false)} open={open} title="Feedback">
        <Select label="Type" onChange={setType} options={types} value={type} />
        <Select label="Priority" onChange={setPriority} options={priorities} value={priority} />
        <Select label="Area" onChange={setArea} options={areas} value={area} />
        <Field label="Title" onChangeText={setTitle} value={title} />
        <Field label="Description" multiline onChangeText={setDescription} value={description} />
        <Button
          disabled={files.length >= 5}
          label={files.length ? `${files.length} photo${files.length === 1 ? "" : "s"}` : "Add photos"}
          onPress={() => {
            void ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsMultipleSelection: true, selectionLimit: 5 - files.length }).then((result) => {
              if (result.canceled) return;
              setFiles((current) =>
                [...current, ...result.assets.map((asset) => ({ uri: asset.uri, name: asset.fileName ?? "photo.jpg", type: asset.mimeType ?? "image/jpeg" }))].slice(0, 5),
              );
            });
          }}
          variant="outline"
        />
        {files.map((file) => (
          <View key={file.uri}>
            <Text>{file.name}</Text>
          </View>
        ))}
        <ErrorText error={error} />
        {sent ? <Text>Thanks. Your note was sent.</Text> : null}
        <Button
          disabled={title.trim().length < 3 || description.trim().length < 3}
          label="Send"
          onPress={() => {
            setPending(true);
            setError(null);
            api
              .createFeedback(
                { type, priority, area, title: title.trim(), description: description.trim(), organizationId: organization.id },
                files,
              )
              .then(() => {
                setSent(true);
                setTitle("");
                setDescription("");
                setFiles([]);
              })
              .catch(setError)
              .finally(() => setPending(false));
          }}
          pending={pending}
        />
      </Sheet>
    </>
  );
}
