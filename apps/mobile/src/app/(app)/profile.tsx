import * as ImagePicker from "expo-image-picker";
import { KeyRoundIcon, UserRoundIcon } from "lucide-react-native";
import { useState } from "react";
import { Image, Text } from "react-native";
import { api } from "@/api/client";
import { useSession } from "@/session";
import { useColors } from "@/theme";
import { Button, ErrorText, Field, PageTitle, Screen, Section } from "@/ui";
import { useWorkspace } from "@/workspace";

export default function ProfileScreen() {
  const colors = useColors();
  const { viewer, organization } = useWorkspace();
  const { user, changePassword, replaceUser } = useSession();
  const profile = user?.profile;
  const [displayName, setDisplayName] = useState(profile?.displayName ?? viewer.name);
  const [description, setDescription] = useState(profile?.description ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [timezone, setTimezone] = useState(profile?.timezone ?? viewer.timezone);
  const [zipCode, setZipCode] = useState(profile?.zipCode ?? "");
  const [notes, setNotes] = useState(profile?.notes ?? "");
  const [accessMessage, setAccessMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<"profile" | "password" | null>(null);

  return (
    <Screen>
      <PageTitle description={viewer.email} title="Profile" />
      <ErrorText error={error} />
      {message ? <Text style={{ color: colors.success, fontSize: 13 }}>{message}</Text> : null}
      <Section icon={UserRoundIcon} title="Your details">
        {viewer.avatarUrl ? <Image source={{ uri: viewer.avatarUrl }} style={{ width: 72, height: 72, borderRadius: 36 }} /> : null}
        <Button
          label="Choose photo"
          onPress={() => {
            void ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 }).then((result) => {
              if (result.canceled || !result.assets[0]) return;
              const asset = result.assets[0];
              setPending("profile");
              api
                .uploadAvatar({ uri: asset.uri, name: asset.fileName ?? "avatar.jpg", type: asset.mimeType ?? "image/jpeg" })
                .then((next) => {
                  replaceUser(next);
                  setMessage("Photo updated.");
                })
                .catch(setError)
                .finally(() => setPending(null));
            });
          }}
          variant="outline"
        />
        {viewer.avatarUrl ? (
          <Button
            label="Remove photo"
            onPress={() => {
              setPending("profile");
              api.deleteAvatar().then((next) => { replaceUser(next); setMessage("Photo removed."); }).catch(setError).finally(() => setPending(null));
            }}
            variant="ghost"
          />
        ) : null}
        <Field autoCapitalize="words" label="Display name" onChangeText={setDisplayName} value={displayName} />
        <Field label="Description" multiline onChangeText={setDescription} value={description} />
        <Field keyboardType="phone-pad" label="Phone" onChangeText={setPhone} value={phone} />
        <Field label="Timezone" onChangeText={setTimezone} value={timezone} />
        <Field label="Zip code" onChangeText={setZipCode} value={zipCode} />
        <Field label="Notes" multiline onChangeText={setNotes} value={notes} />
        <Button
          label="Save profile"
          onPress={() => {
            setPending("profile");
            setError(null);
            api
              .patchMe({
                displayName,
                description: description || null,
                phone: phone || null,
                timezone,
                zipCode: zipCode || null,
                notes: notes || null,
              })
              .then((next) => {
                replaceUser(next);
                setMessage("Profile saved.");
              })
              .catch(setError)
              .finally(() => setPending(null));
          }}
          pending={pending === "profile"}
        />
      </Section>
      <Section description="Ask an admin for a role with more access." title="Access">
        <Field label="Message" multiline onChangeText={setAccessMessage} value={accessMessage} />
        <Button
          disabled={accessMessage.trim().length < 1}
          label="Request more access"
          onPress={() => {
            setPending("profile");
            api
              .createAccessRequest(organization.id, accessMessage.trim())
              .then(() => {
                setAccessMessage("");
                setMessage("Request sent.");
              })
              .catch(setError)
              .finally(() => setPending(null));
          }}
          variant="outline"
        />
      </Section>
      <Section description="At least 8 characters." icon={KeyRoundIcon} title="Password">
        <Field label="Current password" onChangeText={setCurrentPassword} secureTextEntry value={currentPassword} />
        <Field label="New password" onChangeText={setPassword} secureTextEntry value={password} />
        <Button
          disabled={currentPassword.length < 8 || password.length < 8}
          label="Change password"
          onPress={() => {
            setPending("password");
            setError(null);
            changePassword(currentPassword, password)
              .then(() => {
                setCurrentPassword("");
                setPassword("");
                setMessage("Password changed.");
              })
              .catch(setError)
              .finally(() => setPending(null));
          }}
          pending={pending === "password"}
          variant="outline"
        />
      </Section>
    </Screen>
  );
}
