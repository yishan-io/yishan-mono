/** Payload for a plain-text + HTML transactional email. */
export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Thin wrapper around the Resend REST API.
 * Uses a single `fetch` call per email — no SDK dependency needed.
 */
export class ResendEmailService {
  private static readonly SEND_URL = "https://api.resend.com/emails";

  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
  ) {}

  /**
   * Sends one transactional email via Resend.
   * Throws an `Error` with the Resend error message if the request fails.
   */
  async sendEmail(input: SendEmailInput): Promise<void> {
    const response = await fetch(ResendEmailService.SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      let message = `Resend API error: ${response.status}`;
      try {
        const payload = (await response.json()) as { message?: string };
        if (payload?.message) {
          message = payload.message;
        }
      } catch {
        // keep fallback message
      }
      throw new Error(message);
    }
  }
}
