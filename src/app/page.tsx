const FEATURES = [
  {
    name: 'Hubs',
    blurb: 'Spin up a community at h/yourthing and gather your people.',
  },
  {
    name: 'Drops',
    blurb: 'Post text, images, video, or links — with rich previews.',
  },
  {
    name: 'Boost & Bury',
    blurb: 'Vote on what matters. Heat rises, noise sinks.',
  },
  {
    name: 'Clout',
    blurb: 'Earn reputation when the community Boosts your Drops.',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Where communities <span className="text-brand-500">heat up</span>.
        </h1>
        <p className="text-muted mx-auto mt-4 max-w-xl text-lg">
          PostUp is a place to start Hubs, share Drops, and let the best stuff
          rise. This is The Stream — your home feed lands here soon.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <article
            key={f.name}
            className="border-app bg-card rounded-xl border p-5"
          >
            <h2 className="font-semibold text-brand-500">{f.name}</h2>
            <p className="text-muted mt-1 text-sm">{f.blurb}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
