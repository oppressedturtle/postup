'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';

interface Props {
  hubSlug: string;
  type: 'icon' | 'banner';
  currentUrl: string | null;
  label: string;
}

export function MediaForm({ hubSlug, type, currentUrl, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const maxMb = type === 'icon' ? 2 : 5;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError('Only JPEG, PNG, and WebP images are accepted.');
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setError(`${label} must be ${maxMb} MB or smaller.`);
      return;
    }

    setError(null);
    setSuccess(false);

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    uploadFile(file);
  }

  function uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/hubs/${hubSlug}/${type}`);

    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) {
        setProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      setProgress(null);
      if (xhr.status === 200) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        try {
          const data = JSON.parse(xhr.responseText) as {
            error?: { message: string };
          };
          setError(data.error?.message ?? 'Upload failed.');
        } catch {
          setError('Upload failed.');
        }
        setPreview(currentUrl);
      }
    });

    xhr.addEventListener('error', () => {
      setProgress(null);
      setError('Network error. Please try again.');
      setPreview(currentUrl);
    });

    xhr.send(formData);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      {/* Preview */}
      <div className="shrink-0">
        {type === 'icon' ? (
          preview ? (
            <Image
              src={preview}
              alt=""
              width={64}
              height={64}
              className="rounded-full object-cover"
              style={{ width: 64, height: 64 }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 text-xl font-bold text-white"
            >
              {hubSlug[0]?.toUpperCase() ?? 'H'}
            </span>
          )
        ) : preview ? (
          <Image
            src={preview}
            alt=""
            width={160}
            height={48}
            className="h-12 w-40 rounded-lg object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="h-12 w-40 rounded-lg"
            style={{
              background:
                'linear-gradient(135deg, rgb(249 86 18) 0%, rgb(234 61 8) 100%)',
            }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={progress !== null}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {progress !== null ? `Uploading… ${progress}%` : `Upload ${label.toLowerCase()}`}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={`Upload hub ${type}`}
            className="sr-only"
            onChange={handleFileChange}
          />
          <span className="text-xs text-[rgb(var(--muted))]">
            JPEG, PNG, WebP — max {maxMb} MB
          </span>
        </div>

        {progress !== null && (
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} upload progress`}
            className="h-1.5 w-48 overflow-hidden rounded-full bg-[rgb(var(--border))]"
          >
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-green-600 dark:text-green-400">
            {label} updated.
          </p>
        )}
      </div>
    </div>
  );
}
