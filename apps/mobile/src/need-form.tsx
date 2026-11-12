import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/client";
import type { NeedQuestion, NeedQuestions, VolunteerNeed } from "@/api/types";
import { PlacementFields, usePlacement } from "@/placement";
import { Button, DateField, ErrorText, FormField, Input, Muted, TimeField, ToggleGroup } from "@/ui";
import { useWorkspace } from "@/workspace";

function newId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function blankQuestion(): NeedQuestion {
  const first = newId();
  const second = newId();
  return { id: newId(), prompt: "", kind: "single", choices: [{ id: first, label: "" }, { id: second, label: "" }], correctChoiceIds: [first] };
}

export function NeedForm({ need, onSaved }: { need?: VolunteerNeed; onSaved: () => void }) {
  const { organization } = useWorkspace();
  const client = useQueryClient();
  const placement = usePlacement(
    need
      ? { departmentId: need.departmentId ?? undefined, projectId: need.projectId ?? "", taskCategoryId: need.taskCategoryId ?? "" }
      : undefined,
  );
  const [name, setName] = useState(need?.name ?? "");
  const [description, setDescription] = useState(need?.description ?? "");
  const [type, setType] = useState<"Position" | "Task">(need?.type ?? "Position");
  const [count, setCount] = useState(String(need?.countNeeded ?? 1));
  const [startDate, setStartDate] = useState(need?.startDate ?? "");
  const [endDate, setEndDate] = useState(need?.endDate ?? "");
  const [requiredDate, setRequiredDate] = useState(need?.requiredBy?.slice(0, 10) ?? "");
  const [requiredTime, setRequiredTime] = useState(need?.requiredBy ? need.requiredBy.slice(11, 16) : "");
  const [allowPublic, setAllowPublic] = useState(need?.allowPublic ?? false);
  const [requireVetting, setRequireVetting] = useState(need?.requireVetting ?? false);
  const [questions, setQuestions] = useState<NeedQuestion[]>(need?.questions?.items ?? []);
  const [error, setError] = useState<unknown>(null);

  const save = useMutation({
    mutationFn: () => {
      const countNeeded = Number(count);
      if (!Number.isInteger(countNeeded) || countNeeded < 1) throw new Error("People needed must be at least 1.");
      if (name.trim().length < 2) throw new Error("Name is required.");
      const form: NeedQuestions = { version: 1, items: questions };
      for (const question of questions) {
        if (!question.prompt.trim()) throw new Error("Each question needs a prompt.");
        if (question.choices.some((choice) => !choice.label.trim())) throw new Error("Each choice needs a label.");
        if (question.kind === "single" && question.correctChoiceIds.length !== 1) throw new Error("A single-answer question needs one correct choice.");
        if (question.kind === "multi" && question.correctChoiceIds.length === 0) throw new Error("Mark at least one correct choice.");
      }
      const placed = placement.body(description);
      const requiredBy = requiredDate ? new Date(`${requiredDate}T${requiredTime || "00:00"}`).toISOString() : null;
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        type,
        countNeeded,
        startDate: startDate || null,
        endDate: endDate || null,
        requiredBy,
        allowPublic,
        requireVetting,
        questions: form,
        projectId: placed.projectId,
        taskCategoryId: placed.taskCategoryId,
        departmentId: placed.departmentId,
      };
      return need ? api.updateNeed(need.id, body) : api.createNeed(organization.id, body);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["needs", organization.id] });
      onSaved();
    },
    onError: setError,
  });

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= questions.length) return;
    const copy = [...questions];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    setQuestions(copy);
  }

  return (
    <View style={{ gap: 16 }}>
      <FormField label="Name">
        <Input onChangeText={setName} value={name} />
      </FormField>
      <FormField label="Description">
        <Input multiline onChangeText={setDescription} value={description} />
      </FormField>
      <FormField label="Type">
        <ToggleGroup items={[{ id: "Position", label: "Position" }, { id: "Task", label: "Task" }]} onChange={setType} value={type} />
      </FormField>
      <FormField label="People needed">
        <Input keyboardType="number-pad" onChangeText={setCount} value={count} />
      </FormField>
      <DateField label="Starts" max="9999-12-31" onChange={setStartDate} value={startDate || new Date().toISOString().slice(0, 10)} />
      <DateField label="Ends" max="9999-12-31" onChange={setEndDate} value={endDate || startDate || new Date().toISOString().slice(0, 10)} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <DateField label="Required by" max="9999-12-31" onChange={setRequiredDate} value={requiredDate || new Date().toISOString().slice(0, 10)} />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField label="Time" onChange={setRequiredTime} value={requiredTime} />
        </View>
      </View>
      <PlacementFields optional state={placement} />
      <Button label={allowPublic ? "Public sign-up link on" : "Allow a public sign-up link"} onPress={() => setAllowPublic((value) => !value)} variant={allowPublic ? "default" : "outline"} />
      <Button label={requireVetting ? "Vetting required" : "Require vetting"} onPress={() => setRequireVetting((value) => !value)} variant={requireVetting ? "default" : "outline"} />
      <Muted>Questions</Muted>
      {questions.map((question, index) => (
        <View key={question.id} style={{ gap: 8 }}>
          <FormField label={`Question ${index + 1}`}>
            <Input onChangeText={(prompt) => setQuestions((items) => items.map((item) => (item.id === question.id ? { ...item, prompt } : item)))} value={question.prompt} />
          </FormField>
          <ToggleGroup
            items={[{ id: "single", label: "Single answer" }, { id: "multi", label: "Exact set" }]}
            onChange={(kind) =>
              setQuestions((items) =>
                items.map((item) =>
                  item.id === question.id
                    ? { ...item, kind, correctChoiceIds: kind === "single" ? item.correctChoiceIds.slice(0, 1) : item.correctChoiceIds }
                    : item,
                ),
              )
            }
            value={question.kind}
          />
          {question.choices.map((choice) => (
            <View key={choice.id} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Input
                  onChangeText={(label) =>
                    setQuestions((items) =>
                      items.map((item) =>
                        item.id === question.id
                          ? { ...item, choices: item.choices.map((option) => (option.id === choice.id ? { ...option, label } : option)) }
                          : item,
                      ),
                    )
                  }
                  placeholder="Choice"
                  value={choice.label}
                />
              </View>
              <Button
                label={question.correctChoiceIds.includes(choice.id) ? "Correct" : "Mark"}
                onPress={() =>
                  setQuestions((items) =>
                    items.map((item) => {
                      if (item.id !== question.id) return item;
                      const marked = item.correctChoiceIds.includes(choice.id);
                      const correctChoiceIds =
                        item.kind === "single" ? [choice.id] : marked ? item.correctChoiceIds.filter((id) => id !== choice.id) : [...item.correctChoiceIds, choice.id];
                      return { ...item, correctChoiceIds };
                    }),
                  )
                }
                variant={question.correctChoiceIds.includes(choice.id) ? "default" : "outline"}
              />
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Add choice" onPress={() => setQuestions((items) => items.map((item) => (item.id === question.id ? { ...item, choices: [...item.choices, { id: newId(), label: "" }] } : item)))} variant="outline" />
            <Button label="Up" onPress={() => move(index, -1)} variant="ghost" />
            <Button label="Down" onPress={() => move(index, 1)} variant="ghost" />
            <Button label="Remove" onPress={() => setQuestions((items) => items.filter((item) => item.id !== question.id))} variant="ghost" />
          </View>
        </View>
      ))}
      <Button label="Add question" onPress={() => setQuestions((items) => [...items, blankQuestion()])} variant="outline" />
      <ErrorText error={error} />
      <Button label={need ? "Save need" : "Create need"} onPress={() => save.mutate()} pending={save.isPending} />
    </View>
  );
}
