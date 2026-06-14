'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import type { LinkPreviewData } from '@/types/drop';

// Dynamically import the markdown editor (uses browser APIs)
const MDEditor = dynamic(
  () => import('@uiw/react-md-editor').then((m) => m.default),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DropTypeTab = 'TEXT' | 'IMAGE' | 'VIDEO' | 'LINK';

const TAB_LABELS: Record<DropTypeTab, string> = {
  TEXT: 'Text',
  IMAGE: 'Image',
  VIDEO: 'Video',
  LINK: 'Link',
};

// ---------------------------------------------------------------------------
// Upload zone
// ---------------------------------------------------------------------------

interface UploadZoneProps {
  accept: string;
  endpoint: string;
  maxSizeMb: number;
  onUploaded: (url: string) => void;
  hint?: string;
}

function UploadZone({ accept, endpoint, maxSizeMb, onUploaded, hint }: UploadZoneProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    setUploadError(null);

    if (file.size > maxSizeMb * 1024 * 1024) {
      setUploadError(`File must be ${maxSizeMb} MB or smaller.`);
      return;
    }

    // Show local preview for images
    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    }

    setProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    // Use XHR for progress events
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText) as { url: string };
        onUploaded(data.url);
      } else {
        let msg = 'Upload failed. Please try again.';
        try {
          const err = JSON.parse(xhr.responseText) as { error?: { message?: string } };
          if (err.error?.message) msg = err.error.message;
        } catch { /* ignored */ }
        setUploadError(msg);
        setPreviewUrl(null);
      }
    };

    xhr.onerror = () => {
      setProgress(null);
      setUploadError('Network error. Please try again.');
      setPreviewUrl(null);
    };

    xhr.send(formData);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload file — drag and drop or click to browse"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging
            ? 'border-brand-500 bg-brand-500/5'
            : 'border-[rgb(var(--border))] hover:border-brand-500/50'
        }`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Preview" className="max-h-48 rounded-lg object-contain" />
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[rgb(var(--muted))]" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm text-[rgb(var(--fg))]">
              Drag &amp; drop or <span className="text-brand-500 underline">browse</span>
            </p>
            {hint && <p className="text-xs text-[rgb(var(--muted))]">{hint}</p>}
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleChange}
      />

      {progress !== null && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--border))]">
            <div
              className="h-full bg-brand-500 transition-all duration-150"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            />
          </div>
          <p className="mt-1 text-xs text-[rgb(var(--muted))]">{progress}% uploaded</p>
        </div>
      )}

      {uploadError && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {uploadError}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Link preview card (inline)
// ---------------------------------------------------------------------------

function InlineLinkPreview({ preview }: { preview: LinkPreviewData }) {
  return (
    <div className="mt-2 flex overflow-hidden rounded-lg border border-[rgb(var(--border))]">
      {preview.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.imageUrl} alt="" className="h-24 w-32 shrink-0 object-cover" loading="lazy" />
      )}
      <div className="flex flex-col justify-center gap-1 px-3 py-2">
        {preview.domain && (
          <p className="text-xs text-[rgb(var(--muted))]">{preview.domain}</p>
        )}
        {preview.title && (
          <p className="text-sm font-medium text-[rgb(var(--fg))] line-clamp-2">{preview.title}</p>
        )}
        {preview.description && (
          <p className="text-xs text-[rgb(var(--muted))] line-clamp-2">{preview.description}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

interface CreateDropFormProps {
  hubSlug: string;
}

export function CreateDropForm({ hubSlug }: CreateDropFormProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<DropTypeTab>('TEXT');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [toastError, setToastError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Link preview fetch
  // ---------------------------------------------------------------------------

  const fetchPreview = useCallback(async (url: string) => {
    if (!url.trim()) return;
    setFetchingPreview(true);
    setLinkPreview(null);
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = (await res.json()) as LinkPreviewData;
        setLinkPreview(data);
      }
    } catch { /* non-fatal */ }
    finally { setFetchingPreview(false); }
  }, []);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setToastError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, string> = { title, hubSlug, type: activeTab };
      if (activeTab === 'TEXT') payload.body = body;
      if (activeTab === 'IMAGE') payload.imageUrl = imageUrl;
      if (activeTab === 'VIDEO') payload.videoUrl = videoUrl;
      if (activeTab === 'LINK') payload.linkUrl = linkUrl;

      const res = await fetch('/api/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 429) {
        setToastError('You are posting too fast. Please wait before trying again.');
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as {
          error?: { message?: string; details?: Record<string, string[]> };
        };
        if (data.error?.details) {
          setFieldErrors(data.error.details);
        } else {
          setToastError(data.error?.message ?? 'Something went wrong. Please try again.');
        }
        return;
      }

      const data = (await res.json()) as { drop: { id: string } };
      router.push(`/drops/${data.drop.id}`);
    } catch {
      setToastError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const titleRemaining = 300 - title.length;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      {/* Tab selector */}
      <div
        role="tablist"
        aria-label="Drop type"
        className="flex rounded-xl border border-[rgb(var(--border))] p-1 bg-[rgb(var(--card))]"
      >
        {(Object.keys(TAB_LABELS) as DropTypeTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-brand-500 text-white'
                : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Title */}
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="drop-title" className="block text-sm font-medium text-[rgb(var(--fg))]">
            Title <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <span
            aria-live="polite"
            className={`text-xs ${titleRemaining < 20 ? 'text-red-500' : 'text-[rgb(var(--muted))]'}`}
          >
            {titleRemaining}
          </span>
        </div>
        <input
          id="drop-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          required
          placeholder="An interesting title…"
          aria-describedby={fieldErrors.title ? 'title-error' : undefined}
          className="mt-1 block w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        {fieldErrors.title && (
          <p id="title-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {fieldErrors.title.join(', ')}
          </p>
        )}
      </div>

      {/* Body section — switches by tab */}
      <div role="tabpanel">
        {activeTab === 'TEXT' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]">
              Body
            </label>
            {/* data-color-mode prevents the editor from fighting our theme */}
            <div data-color-mode="auto" className="rounded-lg overflow-hidden border border-[rgb(var(--border))]">
              <MDEditor
                value={body}
                onChange={(val) => setBody(val ?? '')}
                height={280}
                preview="live"
                aria-label="Drop body (Markdown)"
              />
            </div>
          </div>
        )}

        {activeTab === 'IMAGE' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]">
              Image <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <UploadZone
              accept="image/jpeg,image/png,image/gif,image/webp"
              endpoint="/api/media/image"
              maxSizeMb={20}
              onUploaded={setImageUrl}
              hint="JPEG, PNG, GIF, WebP — max 20 MB"
            />
            {fieldErrors.imageUrl && (
              <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.imageUrl.join(', ')}
              </p>
            )}
          </div>
        )}

        {activeTab === 'VIDEO' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]">
              Video <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <UploadZone
              accept="video/mp4,video/webm,video/quicktime"
              endpoint="/api/media/video"
              maxSizeMb={500}
              onUploaded={setVideoUrl}
              hint="MP4, WebM, MOV — max 500 MB"
            />
            {fieldErrors.videoUrl && (
              <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.videoUrl.join(', ')}
              </p>
            )}
          </div>
        )}

        {activeTab === 'LINK' && (
          <div>
            <label htmlFor="drop-link-url" className="mb-1 block text-sm font-medium text-[rgb(var(--fg))]">
              URL <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="drop-link-url"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onBlur={() => void fetchPreview(linkUrl)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                void fetchPreview(pasted);
              }}
              placeholder="https://example.com/article"
              aria-describedby={fieldErrors.linkUrl ? 'link-error' : undefined}
              className="block w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-sm text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {fieldErrors.linkUrl && (
              <p id="link-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.linkUrl.join(', ')}
              </p>
            )}
            {fetchingPreview && (
              <p className="mt-2 text-xs text-[rgb(var(--muted))]">Fetching preview…</p>
            )}
            {linkPreview && !fetchingPreview && <InlineLinkPreview preview={linkPreview} />}
          </div>
        )}
      </div>

      {/* Toast error */}
      {toastError && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {toastError}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-brand-500 px-6 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Post Drop'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-[rgb(var(--border))] px-6 py-2 text-sm font-medium text-[rgb(var(--fg))] hover:bg-[rgb(var(--border))] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
