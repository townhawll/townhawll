import { loadEmailEnvironment } from "@townhawll/config/server-env";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getApplicationUrl(): string {
  return loadEmailEnvironment().APP_URL.replace(/\/$/, "");
}

function createActionEmailHtml(input: {
  buttonLabel: string;
  description: string;
  expiryNotice: string;
  preview: string;
  securityNotice: string;
  title: string;
  url: string;
}): string {
  const safeUrl = escapeHtml(input.url);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;background:#09090b;color:#f4f4f5;font-family:Inter,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#09090b;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
            <tr>
              <td style="padding:0 4px 20px;color:#8b5cf6;font-size:18px;font-weight:700;letter-spacing:-0.2px;">TownHawll</td>
            </tr>
            <tr>
              <td style="border:1px solid #292930;border-radius:14px;background:#121216;padding:40px 36px;">
                <p style="margin:0 0 12px;color:#f4f4f5;font-size:26px;font-weight:700;line-height:1.25;letter-spacing:-0.4px;">${escapeHtml(input.title)}</p>
                <p style="margin:0 0 28px;color:#b4b4bc;font-size:15px;line-height:1.65;">${escapeHtml(input.description)}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-radius:8px;background:#7c3aed;">
                      <a href="${safeUrl}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:15px;font-weight:700;line-height:1;text-decoration:none;">${escapeHtml(input.buttonLabel)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 8px;color:#777781;font-size:12px;line-height:1.6;">${escapeHtml(input.expiryNotice)} If the button does not work, copy and paste this address into your browser:</p>
                <p style="margin:0;word-break:break-all;color:#8b5cf6;font-size:12px;line-height:1.6;"><a href="${safeUrl}" style="color:#8b5cf6;text-decoration:underline;">${safeUrl}</a></p>
                <div style="margin-top:28px;border-top:1px solid #292930;padding-top:20px;">
                  <p style="margin:0;color:#777781;font-size:12px;line-height:1.6;">${escapeHtml(input.securityNotice)}</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0;color:#52525b;font-size:11px;line-height:1.5;">This is an automated account-security email from TownHawll.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendTransactionalEmail(input: {
  email: string;
  html: string;
  idempotencyKey: string;
  subject: string;
  text: string;
}): Promise<void> {
  const environment = loadEmailEnvironment();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from: environment.EMAIL_FROM,
      to: input.email,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error("The email provider rejected the message.");
  }
}

export async function sendVerificationEmail(input: {
  email: string;
  verificationUrl: string;
  idempotencyKey: string;
}): Promise<void> {
  await sendTransactionalEmail({
    email: input.email,
    html: createActionEmailHtml({
      buttonLabel: "Verify email address",
      description:
        "Thanks for creating a TownHawll account. Confirm your email address to finish setting it up.",
      expiryNotice: "This link expires in 24 hours.",
      preview:
        "Complete your TownHawll account by verifying your email address.",
      securityNotice:
        "If you did not create this account, you can safely ignore this email.",
      title: "Verify your email",
      url: input.verificationUrl,
    }),
    idempotencyKey: input.idempotencyKey,
    subject: "Verify your TownHawll email",
    text: `Verify your email\n\nThanks for creating a TownHawll account. Confirm your email address to finish setting it up:\n\n${input.verificationUrl}\n\nThis link expires in 24 hours. If you did not create this account, you can safely ignore this email.`,
  });
}

export async function sendPasswordResetEmail(input: {
  email: string;
  idempotencyKey: string;
  resetUrl: string;
}): Promise<void> {
  await sendTransactionalEmail({
    email: input.email,
    html: createActionEmailHtml({
      buttonLabel: "Reset password",
      description:
        "We received a request to reset the password for your TownHawll account.",
      expiryNotice: "This link expires in 1 hour and can be used only once.",
      preview: "Use this secure link to reset your TownHawll password.",
      securityNotice:
        "If you did not request a password reset, you can safely ignore this email. Your password has not changed.",
      title: "Reset your password",
      url: input.resetUrl,
    }),
    idempotencyKey: input.idempotencyKey,
    subject: "Reset your TownHawll password",
    text: `Reset your password\n\nWe received a request to reset the password for your TownHawll account:\n\n${input.resetUrl}\n\nThis link expires in 1 hour and can be used only once. If you did not request this reset, you can safely ignore this email.`,
  });
}
