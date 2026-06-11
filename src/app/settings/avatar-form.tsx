'use client';

import { useRef, useState } from 'react';
import { Avatar } from '@/components/user-nav';

interface Props {
  avatarUrl: string | null;
  displayName: string;
}

export function AvatarForm({ avatarUrl, displayName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const initials = displayName.slice(0, 2).toUpperCase();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError('Only JPEG, PNG, GIF, and WebP images are accepted.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Avatar must be 5 MB or smaller.');
      return;
    }

    setError(null);
    setSuccess(false);

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    uploadFile(file);
  }

  function uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/user/avatar');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
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
        // Reset preview to original on error
        setPreview(avatarUrl);
      }
    });

    xhr.addEventListener('error', () => {
      setProgress(null);
      setError('Network error. Please try again.');
      setPreview(avatarUrl);
    });

    xhr.send(formData);
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <Avatar src={preview} initials={initials} size={80} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={progress !== null}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {progress !== null ? `Uploading… ${progress}%` : 'Upload avatar'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            aria-label="Upload avatar image"
            className="sr-only"
            onChange={handleFileChange}
          />
          <span className="text-xs text-[rgb(var(--muted))]">
            JPEG, PNG, GIF, WebP — max 5 MB
          </span>
        </div>

        {progress !== null && (
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
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
            Avatar updated.
          </p>
        )}
      </div>
    </div>
  );
}
