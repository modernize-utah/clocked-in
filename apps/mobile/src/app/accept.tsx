import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { api } from "@/api/client";
import { AuthFrame } from "@/auth-frame";
import { useSession } from "@/session";
import { Button, ErrorText, Field, Muted } from "@/ui";

export default function AcceptInviteScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const initial = typeof params.code === "string" ? params.code : "";
  const { status } = useSession();
  const [code, setCode] = useState(initial);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <AuthFrame description="Paste the code from the invite email, or open the invite link on this device." title="Accept an invite">
      {status !== "ready" ? (
        <>
          <Muted>Sign in or create an account with the invited email, then come back with the code.</Muted>
          <Link href="/login">
            <Text>Sign in</Text>
          </Link>
          <Link href="/signup">
            <Text>Create an account</Text>
          </Link>
        </>
      ) : null}
      {done ? <Muted>Invite accepted. Switch to the organization from the header.</Muted> : null}
      <Field autoCapitalize="none" label="Invite code" onChangeText={setCode} value={code} />
      <ErrorText error={error} />
      <Button
        disabled={status !== "ready" || code.trim().length < 4}
        label="Accept invite"
        onPress={() => {
          setPending(true);
          setError(null);
          api
            .acceptInvitation(code.trim())
            .then(() => setDone(true))
            .catch(setError)
            .finally(() => setPending(false));
        }}
        pending={pending}
        size="lg"
      />
    </AuthFrame>
  );
}
