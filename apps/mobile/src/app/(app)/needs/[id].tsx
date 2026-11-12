import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Share, Text, View } from "react-native";
import { api } from "@/api/client";
import { NeedForm } from "@/need-form";
import { Button, ErrorText, FormField, Input, ListRow, Loading, Muted, PageTitle, Panel, Screen, Sheet } from "@/ui";
import { useWorkspace } from "@/workspace";

function origin() {
  return (process.env.EXPO_PUBLIC_WEB_URL || process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:3025").replace(/\/$/, "");
}

export default function NeedDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const needId = Array.isArray(id) ? id[0] : id;
  const { organization, permissions } = useWorkspace();
  const client = useQueryClient();
  const need = useQuery({ queryKey: ["need", needId], queryFn: () => api.getNeed(needId), enabled: Boolean(needId) });
  const signups = useQuery({ queryKey: ["signups", needId], queryFn: () => api.signups(needId), enabled: Boolean(needId) });
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const canApprove = permissions.includes("approve_needs");
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["need", needId] });
    await client.invalidateQueries({ queryKey: ["signups", needId] });
    await client.invalidateQueries({ queryKey: ["needs", organization.id] });
  };
  const decide = useMutation({
    mutationFn: (status: "published" | "rejected") => api.decideNeed(needId, status),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteNeed(needId),
    onSuccess: () => router.back(),
  });
  const vet = useMutation({
    mutationFn: (input: { signupId: string; vetted: boolean }) => api.vetSignup(needId, input.signupId, input.vetted),
    onSuccess: refresh,
  });
  const drop = useMutation({
    mutationFn: (signupId: string) => api.deleteSignup(needId, signupId),
    onSuccess: refresh,
  });
  const email = useMutation({
    mutationFn: () => api.emailVolunteers(needId, { signupIds: selected, subject: subject.trim(), body: message.trim() }),
    onSuccess: () => {
      setEmailOpen(false);
      setSubject("");
      setMessage("");
      setSelected([]);
    },
  });

  if (need.isLoading) return <Loading />;
  if (!need.data) {
    return (
      <Screen>
        <PageTitle title="Need" />
        <ErrorText error={need.error ?? "This need could not be loaded."} />
      </Screen>
    );
  }
  const item = need.data;
  const link = item.publicToken ? `${origin()}/volunteer/${item.publicToken}` : "";

  return (
    <Screen>
      <PageTitle description={`${item.type} · ${item.countVetted}/${item.countNeeded} vetted · ${item.status ?? "published"}`} title={item.name} />
      {item.description ? <Muted>{item.description}</Muted> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {canApprove && item.status === "pending_approval" ? <Button label="Publish" onPress={() => decide.mutate("published")} pending={decide.isPending} /> : null}
        {canApprove && item.status === "pending_approval" ? <Button label="Reject" onPress={() => decide.mutate("rejected")} variant="outline" /> : null}
        <Button label="Edit" onPress={() => setEditing(true)} variant="outline" />
        <Button label="Delete" onPress={() => remove.mutate()} variant="ghost" />
      </View>
      {link ? <Button label="Share public link" onPress={() => void Share.share({ message: link })} variant="outline" /> : null}
      <ErrorText error={decide.error ?? remove.error ?? vet.error ?? drop.error} />
      <Panel>
        {(signups.data?.items ?? []).map((signup) => {
          const on = selected.includes(signup.id);
          return (
            <ListRow
              detail={[signup.email, signup.phone, signup.kind === "guest" ? "Guest" : "Member", signup.passed ? "Answers matched" : "Answers differ", signup.comment]
                .filter(Boolean)
                .join(" · ")}
              key={signup.id}
              onPress={() => setSelected((current) => (on ? current.filter((value) => value !== signup.id) : [...current, signup.id]))}
              right={
                <View style={{ gap: 4 }}>
                  <Button label={signup.vetted ? "Remove vetting" : "Vet"} onPress={() => vet.mutate({ signupId: signup.id, vetted: !signup.vetted })} variant="outline" />
                  <Button label="Remove" onPress={() => drop.mutate(signup.id)} variant="ghost" />
                </View>
              }
              title={`${on ? "✓ " : ""}${signup.name}`}
            />
          );
        })}
        {!signups.data?.items.length ? (
          <View style={{ padding: 16 }}>
            <Muted>{signups.isPending ? "Loading sign-ups…" : "No sign-ups yet."}</Muted>
          </View>
        ) : null}
      </Panel>
      <Button disabled={selected.length === 0} label="Email selected volunteers" onPress={() => setEmailOpen(true)} />
      <Sheet onClose={() => setEditing(false)} open={editing} title="Edit need">
        <NeedForm need={item} onSaved={() => setEditing(false)} />
      </Sheet>
      <Sheet onClose={() => setEmailOpen(false)} open={emailOpen} title="Email volunteers">
        <FormField label="Subject">
          <Input onChangeText={setSubject} value={subject} />
        </FormField>
        <FormField label="Message">
          <Input multiline onChangeText={setMessage} value={message} />
        </FormField>
        <ErrorText error={email.error} />
        <Button disabled={!subject.trim() || !message.trim()} label="Send" onPress={() => email.mutate()} pending={email.isPending} />
      </Sheet>
      {email.isSuccess ? <Text>Email sent.</Text> : null}
    </Screen>
  );
}
