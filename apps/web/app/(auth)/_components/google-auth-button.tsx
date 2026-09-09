import { googleSignInAction } from "../_actions/google";
import { SubmitButton } from "./submit-button";

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.614Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.91-2.258c-.805.54-1.835.859-3.046.859-2.344 0-4.328-1.585-5.037-3.715H.956v2.332A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.963 10.705A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.705V4.963H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.037l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.58C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.963l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleAuthButton({
  callbackUrl,
}: Readonly<{ callbackUrl: string }>) {
  return (
    <>
      <form action={googleSignInAction} className="mt-6">
        <input name="callbackUrl" type="hidden" value={callbackUrl} />
        <SubmitButton pendingLabel="Connecting to Google…" variant="secondary">
          <GoogleLogo />
          Continue with Google
        </SubmitButton>
      </form>
      <div className="mt-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border-subtle" />
        <span className="text-xs uppercase tracking-wide text-foreground-muted">
          or
        </span>
        <span className="h-px flex-1 bg-border-subtle" />
      </div>
    </>
  );
}
