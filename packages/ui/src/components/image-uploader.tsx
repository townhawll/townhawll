"use client";

import { CheckCircle2, ImageIcon, LoaderCircle, Upload, X } from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Button } from "./button";

type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface ImageUploaderProps {
  endpoint: string;
  initialImageUrl?: string | null;
  maxBytes?: number;
  accept?: string;
  label?: string;
}

export function ImageUploader({
  endpoint,
  initialImageUrl = null,
  maxBytes = 5 * 1024 * 1024,
  accept = "image/jpeg,image/png,image/webp",
  label = "Avatar",
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const previewObjectUrl = useRef<string | null>(null);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (previewObjectUrl.current)
        URL.revokeObjectURL(previewObjectUrl.current);
    },
    [],
  );

  function validateClientFile(file: File): string | null {
    if (!accept.split(",").includes(file.type)) {
      return "Choose a JPEG, PNG, or WebP image.";
    }
    if (file.size === 0) return "The selected image is empty.";
    if (file.size > maxBytes) return "Choose an image smaller than 5 MB.";
    return null;
  }

  function upload(file: File) {
    const validationError = validateClientFile(file);
    if (validationError) {
      setStatus("error");
      setMessage(validationError);
      return;
    }

    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = URL.createObjectURL(file);
    setImageUrl(previewObjectUrl.current);
    setStatus("uploading");
    setProgress(0);
    setMessage("Uploading image…");

    const body = new FormData();
    body.set("image", file);
    const request = new XMLHttpRequest();
    request.open("POST", endpoint);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      let response: { avatarUrl?: string; error?: string } = {};
      try {
        response = JSON.parse(request.responseText) as typeof response;
      } catch {
        response = {};
      }
      if (request.status >= 200 && request.status < 300 && response.avatarUrl) {
        if (previewObjectUrl.current) {
          URL.revokeObjectURL(previewObjectUrl.current);
          previewObjectUrl.current = null;
        }
        setImageUrl(response.avatarUrl);
        setProgress(100);
        setStatus("success");
        setMessage("Avatar uploaded.");
      } else {
        setImageUrl(initialImageUrl);
        setStatus("error");
        setMessage(response.error ?? "The upload failed. Please try again.");
      }
    });
    request.addEventListener("error", () => {
      setImageUrl(initialImageUrl);
      setStatus("error");
      setMessage("The upload failed. Check your connection and try again.");
    });
    request.send(body);
  }

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) upload(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && status !== "uploading") upload(file);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLabelElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  async function removeImage() {
    setStatus("uploading");
    setProgress(0);
    setMessage("Removing avatar…");
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      setImageUrl(null);
      setStatus("success");
      setMessage("Avatar removed.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : "The avatar could not be removed.",
      );
    }
  }

  const busy = status === "uploading";

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-stretch gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border-default bg-surface-2">
          {imageUrl ? (
            <img
              alt="Avatar preview"
              className="size-full object-cover"
              src={imageUrl}
            />
          ) : (
            <ImageIcon
              aria-hidden="true"
              className="text-foreground-muted"
              size={24}
            />
          )}
        </div>
        <label
          aria-disabled={busy}
          className={`flex min-h-20 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors duration-fast focus-visible:outline-none ${
            isDragging
              ? "border-accent bg-accent-muted"
              : "border-border-default bg-surface-1 hover:border-border-strong hover:bg-surface-2"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
          htmlFor={inputId}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          onKeyDown={handleKeyDown}
          tabIndex={busy ? -1 : 0}
        >
          {busy ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={20}
            />
          ) : (
            <Upload aria-hidden="true" size={20} />
          )}
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              {imageUrl ? "Replace image" : "Upload image"}
            </span>
            <span className="block text-xs leading-5 text-foreground-muted">
              Drag and drop or tap to choose · JPEG, PNG, WebP · max 5 MB
            </span>
          </span>
          <input
            accept={accept}
            className="sr-only"
            disabled={busy}
            id={inputId}
            onChange={chooseFiles}
            ref={inputRef}
            type="file"
          />
        </label>
      </div>
      {busy ? (
        <div
          aria-label={`Upload progress: ${progress}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="h-1 overflow-hidden rounded-sm bg-border-default"
          role="progressbar"
        >
          <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p
          className={`flex items-center gap-1.5 text-xs ${status === "error" ? "text-danger" : "text-foreground-muted"}`}
          role={status === "error" ? "alert" : "status"}
        >
          {status === "success" ? (
            <CheckCircle2 aria-hidden="true" size={14} />
          ) : null}
          {message}
        </p>
        {imageUrl && !busy ? (
          <Button
            onClick={() => void removeImage()}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" size={14} />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
