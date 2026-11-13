"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "cn";
import { ImagePlusIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const maxBytes = 4 * 1024 * 1024;
export const imageAccept = "image/png,image/jpeg,image/webp,image/gif";
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

export const imageUploaderHint = "PNG, JPEG, WebP, or GIF. 4 MB or smaller.";

type Surface = "muted" | "dark" | "light";
type Shape = "square" | "wide";

export function validateImageFile(file: File) {
  if (file.size <= 0) return "Choose an image to upload.";
  if (file.size > maxBytes) return "Image must be 4 MB or smaller.";
  if (file.type) {
    return allowedTypes.has(file.type) ? null : "Upload a PNG, JPEG, WebP, or GIF image.";
  }

  const name = file.name.toLowerCase();
  return allowedExtensions.some((extension) => name.endsWith(extension))
    ? null
    : "Upload a PNG, JPEG, WebP, or GIF image.";
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
}

export function ImageUploader({
  src,
  emptyLabel,
  hint = imageUploaderHint,
  surface = "muted",
  shape = "wide",
  onUpload,
  onRemove,
}: {
  src: string | null;
  emptyLabel: string;
  hint?: string;
  surface?: Surface;
  shape?: Shape;
  onUpload: (file: File) => Promise<unknown>;
  onRemove?: () => Promise<unknown>;
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const dragDepth = useRef(0);
  const seenSrc = useRef(src);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "removing">("idle");
  const [error, setError] = useState<string | null>(null);
  const shown = preview ?? src;
  const busy = phase !== "idle";

  const replacePreview = useCallback((next: string | null) => {
    if (previewRef.current && previewRef.current !== next) {
      URL.revokeObjectURL(previewRef.current);
    }
    previewRef.current = next;
    setPreview(next);
  }, []);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  useEffect(() => {
    if (seenSrc.current === src) return;
    seenSrc.current = src;
    replacePreview(null);
  }, [src, replacePreview]);

  function take(file: File | undefined) {
    if (!file || busy) return;
    const message = validateImageFile(file);
    if (message) {
      setError(message);
      return;
    }

    setError(null);
    replacePreview(URL.createObjectURL(file));
    setPhase("uploading");
    void onUpload(file).then(
      () => setPhase("idle"),
      (reason: unknown) => {
        replacePreview(null);
        setPhase("idle");
        setError(errorMessage(reason));
      },
    );
  }

  function remove() {
    if (!onRemove || busy) return;
    setError(null);
    setPhase("removing");
    void onRemove().then(
      () => setPhase("idle"),
      (reason: unknown) => {
        setPhase("idle");
        setError(errorMessage(reason));
      },
    );
  }

  return (
    <div className="grid gap-2">
      <label
        htmlFor={inputId}
        data-dragging={dragging ? "" : undefined}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          take(event.dataTransfer.files.item(0) ?? undefined);
        }}
        className={cn(
          "group/drop relative flex h-40 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed transition-colors outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-dragging:border-primary data-dragging:ring-3 data-dragging:ring-primary/25",
          busy && "pointer-events-none",
          surface === "dark" && "border-white/25 bg-[oklch(0.18_0_0)] text-white data-dragging:bg-white/5",
          surface === "light" && "border-foreground/15 bg-white text-muted-foreground data-dragging:bg-primary/5",
          surface === "muted" && "border-foreground/15 bg-muted/50 text-muted-foreground data-dragging:bg-primary/5",
          shown && surface !== "dark" && "border-solid border-transparent ring-1 ring-foreground/10",
          shown && surface === "dark" && "border-solid border-transparent",
          !shown && surface === "dark" && "hover:border-white/50 hover:bg-white/5",
          !shown && surface !== "dark" && "hover:border-foreground/25 hover:bg-muted/80",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={imageAccept}
          disabled={busy}
          aria-label={shown ? "Replace image" : emptyLabel}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
          aria-busy={busy || undefined}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            take(file);
          }}
        />
        {shown ? (
          <>
            {shape === "square" ? (
              <span aria-hidden className="pointer-events-none flex size-20 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-black/10">
                <img src={shown} alt="" className="size-14 rounded-md object-cover" />
              </span>
            ) : (
              <img src={shown} alt="" className="pointer-events-none max-h-24 max-w-[92%] object-contain" />
            )}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 text-sm font-medium text-white opacity-0 transition-opacity group-hover/drop:opacity-100 group-focus-within/drop:opacity-100",
                (dragging || busy) && "opacity-100",
              )}
            >
              {busy ? <Loader2Icon className="size-5 animate-spin" /> : <UploadIcon className="size-5" />}
              {phase === "uploading"
                ? "Uploading…"
                : phase === "removing"
                  ? "Removing…"
                  : dragging
                    ? "Drop to replace"
                    : "Replace image"}
            </span>
          </>
        ) : (
          <span aria-hidden className="pointer-events-none flex flex-col items-center gap-2 px-6 text-center">
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-full ring-1",
                surface === "dark"
                  ? "bg-white/10 text-white ring-white/20"
                  : "bg-background text-foreground ring-foreground/10",
              )}
            >
              {dragging ? <UploadIcon className="size-5" /> : <ImagePlusIcon className="size-5" />}
            </span>
            <span className={cn("text-sm font-medium", surface === "dark" ? "text-white" : "text-foreground")}>
              {dragging ? "Drop to upload" : emptyLabel}
            </span>
            <span className={cn("text-xs", surface === "dark" ? "text-white/70" : "text-muted-foreground")}>
              {dragging ? "Release to start the upload" : "or click to browse"}
            </span>
          </span>
        )}
      </label>
      <div className="flex items-center justify-between gap-3">
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
        {onRemove && src ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={remove}
          >
            {phase === "removing" ? <Loader2Icon className="animate-spin" /> : null}
            Remove
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
