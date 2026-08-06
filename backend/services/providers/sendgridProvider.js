export class SendGridEmailProvider {
  constructor({
    apiKey = process.env.SENDGRID_API_KEY,
    from = process.env.EMAIL_FROM,
    replyTo = process.env.EMAIL_REPLY_TO,
  } = {}) {
    this.name = "sendgrid";
    this.apiKey = apiKey;
    this.from = from;
    this.replyTo = replyTo;
  }

  async sendEmail({ to, subject, html, text, metadata }) {
    if (!this.apiKey) {
      return { provider: this.name, status: "failed", error: "SENDGRID_API_KEY is required." };
    }
    if (!this.from) {
      return { provider: this.name, status: "failed", error: "EMAIL_FROM is required." };
    }
    if (!to) {
      return { provider: this.name, status: "failed", error: "Recipient address is required." };
    }

    const content = [
      html ? { type: "text/html", value: html } : null,
      text ? { type: "text/plain", value: text } : null,
    ].filter(Boolean);
    if (!content.length) {
      content.push({ type: "text/plain", value: subject || "Message" });
    }

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: to }],
            custom_args: metadata ? Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, String(value)])) : undefined,
          },
        ],
        from: { email: this.from },
        reply_to: this.replyTo ? { email: this.replyTo } : undefined,
        subject: subject || "Message",
        content,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        provider: this.name,
        status: "failed",
        error: errorText || `SendGrid returned HTTP ${response.status}.`,
      };
    }

    return {
      provider: this.name,
      status: "sent",
      id: response.headers.get("x-message-id") || null,
      to,
      metadata: metadata || null,
    };
  }
}
