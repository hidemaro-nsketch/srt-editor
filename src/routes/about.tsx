import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">Guide</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Capture labels without leaving the timeline.
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          The workspace is optimized for quick annotation: upload a local file,
          set start/end from the playhead, and keep labels consistent before
          export.
        </p>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          {
            title: '1. Load media',
            body: 'Upload video or audio. The player stays local-only and reads duration automatically.',
          },
          {
            title: '2. Define labels',
            body: 'Add, rename, or remove labels. Removing a label clears it from segments and blocks export until fixed.',
          },
          {
            title: '3. Mark segments',
            body: 'Use the playhead to set start/end, edit times manually, and choose labels per segment.',
          },
          {
            title: '4. Export SRT',
            body: 'Validation ensures start < end and labels exist. Exported file is always named labels.srt.',
          },
        ].map((item) => (
          <article key={item.title} className="island-shell feature-card rounded-2xl p-5">
            <h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">
              {item.title}
            </h2>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{item.body}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
