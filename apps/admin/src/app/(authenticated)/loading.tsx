export default function AuthenticatedAdminLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading admin page"
      className="mx-auto w-full max-w-5xl animate-pulse"
      role="status"
    >
      <div className="h-4 w-24 rounded-sm bg-surface-3" />
      <div className="mt-4 h-8 w-full max-w-sm rounded-md bg-surface-3" />
      <div className="mt-3 h-4 w-full max-w-xl rounded-sm bg-surface-2" />
      <div className="my-6 h-px w-full bg-border-subtle" />
      <div className="h-5 w-32 rounded-sm bg-surface-3" />
      <div className="mt-4 h-36 w-full max-w-3xl rounded-lg border border-border-subtle bg-surface-1" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
