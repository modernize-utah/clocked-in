import { useQueryClient } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { api } from "@/api/client";
import { AuthFrame } from "@/auth-frame";
import { useSession } from "@/session";
import { Button, ErrorText, Field } from "@/ui";

export default function NewOrganizationScreen() {
  const { status, setOrganizationId, logout } = useSession();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  if (status !== "ready") return <Redirect href="/" />;
  const back = router.canGoBack();

  return (
    <AuthFrame description="Name it now. You can change the details and brand in Settings." title="New organization">
      <Field autoCapitalize="words" label="Name" onChangeText={setName} value={name} />
      <ErrorText error={error} />
      <Button
        disabled={name.trim().length < 2}
        label="Create organization"
        onPress={() => {
          setPending(true);
          setError(null);
          api
            .createOrganization(name.trim())
            .then(async (organization) => {
              await setOrganizationId(organization.id);
              await client.invalidateQueries({ queryKey: ["workspace"] });
              router.replace("/log");
            })
            .catch(setError)
            .finally(() => setPending(false));
        }}
        pending={pending}
        size="lg"
      />
      {back ? <Button label="Cancel" onPress={() => router.back()} variant="ghost" /> : <Button label="Sign out" onPress={() => void logout()} variant="ghost" />}
    </AuthFrame>
  );
}
