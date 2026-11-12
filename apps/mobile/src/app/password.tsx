import { Redirect } from "expo-router";
import { useState } from "react";
import { AuthFrame } from "@/auth-frame";
import { useSession } from "@/session";
import { Button, ErrorText, Field } from "@/ui";

export default function PasswordScreen() {
  const { status, pendingPassword, changePassword, logout } = useSession();
  const [currentPassword, setCurrentPassword] = useState(pendingPassword);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  if (status === "signedOut") return <Redirect href="/login" />;
  if (status === "ready") return <Redirect href="/log" />;
  if (status === "loading") return null;

  return (
    <AuthFrame description="This account needs a new password before the rest of VolunTime opens." title="Choose a new password">
      <Field label="Current password" onChangeText={setCurrentPassword} secureTextEntry value={currentPassword} />
      <Field hint="At least 8 characters" label="New password" onChangeText={setPassword} secureTextEntry value={password} />
      <ErrorText error={error} />
      <Button
        disabled={currentPassword.length < 8 || password.length < 8}
        label="Save password"
        onPress={() => {
          setPending(true);
          setError(null);
          changePassword(currentPassword, password)
            .catch(setError)
            .finally(() => setPending(false));
        }}
        pending={pending}
        size="lg"
      />
      <Button label="Sign out" onPress={() => void logout()} variant="ghost" />
    </AuthFrame>
  );
}
