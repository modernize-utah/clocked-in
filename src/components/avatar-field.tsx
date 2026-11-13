"use client";

import { useEffect, useId, useRef, useState } from "react";
import { avatarImageSrc } from "@/lib/avatar";
import { AvatarEditor } from "@/components/avatar-editor";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { imageAccept, imageUploaderHint, validateImageFile } from "@/components/image-uploader";

function assignFile(input: HTMLInputElement | null, file: File | null) {
  if (!input) return;
  if (!file) {
    input.value = "";
    return;
  }

  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
}

export function AvatarField({
  userId,
  value,
  onChange,
}: {
  userId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const browseId = useId();
  const browseRef = useRef<HTMLInputElement>(null);
  const croppedRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const seenValue = useRef(value);
  const [preview, setPreview] = useState<string | null>(null);
  const [source, setSource] = useState<File | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = preview ?? avatarImageSrc(userId, value);

  function replacePreview(next: string | null) {
    if (previewRef.current && previewRef.current !== next) {
      URL.revokeObjectURL(previewRef.current);
    }
    previewRef.current = next;
    setPreview(next);
  }

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  useEffect(() => {
    if (seenValue.current === value) return;
    seenValue.current = value;
    replacePreview(null);
    assignFile(croppedRef.current, null);
  }, [value]);

  function browse() {
    browseRef.current?.click();
  }

  function take(file: File | undefined) {
    if (!file) return;
    const message = validateImageFile(file);
    if (message) {
      setError(message);
      return;
    }

    setError(null);
    setSource(file);
    setEditorOpen(true);
  }

  function remove() {
    replacePreview(null);
    assignFile(croppedRef.current, null);
    setError(null);
    seenValue.current = "";
    onChange("");
  }

  return (
    <Field
      label="Avatar"
      htmlFor={browseId}
      hint={`Upload a photo, then drag it so your face sits in the circle. ${imageUploaderHint}`}
      error={error}
      className="sm:col-span-2"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="size-12 shrink-0 overflow-hidden rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={shown ? "Change photo" : "Upload photo"}
          onClick={browse}
        >
          {shown ? (
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center bg-muted text-xs text-muted-foreground">None</span>
          )}
        </button>
        <Button type="button" variant="outline" size="lg" onClick={browse}>
          Upload
        </Button>
        {shown ? (
          <Button type="button" variant="ghost" size="lg" onClick={remove}>
            Remove
          </Button>
        ) : null}
      </div>
      <input
        ref={browseRef}
        id={browseId}
        type="file"
        accept={imageAccept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          take(file);
        }}
      />
      <input ref={croppedRef} type="file" name="avatar" tabIndex={-1} className="sr-only" aria-hidden />
      <input type="hidden" name="avatarUrl" value={value} />
      <AvatarEditor
        file={source}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onConfirm={(file) => {
          assignFile(croppedRef.current, file);
          replacePreview(URL.createObjectURL(file));
          setError(null);
        }}
      />
    </Field>
  );
}
