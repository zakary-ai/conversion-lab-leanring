/**
 * Email provider abstraction.
 *
 * Resend is the built-in integration; any transactional provider can be
 * swapped in by implementing EmailProvider.
 *
 * Required environment variables:
 *   RESEND_API_KEY — Resend API key
 *   EMAIL_FROM     — verified sender, e.g. "Conversion Lab <no-reply@conversionlab.io>"
 *
 * Without credentials, emails are logged to the server console in development
 * (so password-reset links remain usable) and reported as not-sent in
 * production — never silently faked.
 */

export interface EmailProvider {
  readonly configured: boolean;
  send(opts: { to: string; subject: string; html: string }): Promise<{ sent: boolean; devFallback?: boolean }>;
}

class ResendProvider implements EmailProvider {
  private apiKey = process.env.RESEND_API_KEY ?? "";
  private from = process.env.EMAIL_FROM ?? "";

  get configured() {
    return Boolean(this.apiKey && this.from);
  }

  async send(opts: { to: string; subject: string; html: string }) {
    if (!this.configured) {
      if (process.env.NODE_ENV !== "production") {
        console.info(`[email:dev-fallback] To: ${opts.to} | Subject: ${opts.subject}\n${opts.html}`);
        return { sent: false, devFallback: true };
      }
      return { sent: false };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    return { sent: res.ok };
  }
}

export function getEmailProvider(): EmailProvider {
  return new ResendProvider();
}
