import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/api/client";
import { Button, ErrorText, Field, Muted, PageTitle, Screen, Section } from "@/ui";
import { useWorkspace } from "@/workspace";

export default function OrganizationScreen() {
  const { organization, isAdmin } = useWorkspace();
  const client = useQueryClient();
  const [name, setName] = useState(organization.name);
  const [websiteUrl, setWebsiteUrl] = useState(organization.websiteUrl ?? "");
  const [description, setDescription] = useState(organization.description ?? "");
  const save = useMutation({
    mutationFn: () =>
      api.updateOrganization(organization.id, {
        name: name.trim(),
        websiteUrl: websiteUrl.trim() || null,
        description: description.trim() || null,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["workspace"] }),
  });

  return (
    <Screen>
      <PageTitle title={organization.name} />
      {isAdmin ? (
        <Section title="Organization">
          <Field label="Name" onChangeText={setName} value={name} />
          <Field keyboardType="url" label="Website" onChangeText={setWebsiteUrl} value={websiteUrl} />
          <Field label="Description" multiline onChangeText={setDescription} value={description} />
          <ErrorText error={save.error} />
          <Button disabled={name.trim().length < 1} label="Save" onPress={() => save.mutate()} pending={save.isPending} />
        </Section>
      ) : (
        <Section title="Organization">
          <Muted>{organization.websiteUrl || "No website"}</Muted>
          <Muted>{organization.description || "No description"}</Muted>
        </Section>
      )}
    </Screen>
  );
}
