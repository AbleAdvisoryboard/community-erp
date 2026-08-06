export class TwilioSmsProvider {
  constructor({
    accountSid = process.env.TWILIO_ACCOUNT_SID,
    authToken = process.env.TWILIO_AUTH_TOKEN,
    from = process.env.TWILIO_FROM,
  } = {}) {
    this.name = "twilio";
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.from = from;
  }

  async sendSms({ to, message, metadata }) {
    if (!this.accountSid) {
      return { provider: this.name, status: "failed", error: "TWILIO_ACCOUNT_SID is required." };
    }
    if (!this.authToken) {
      return { provider: this.name, status: "failed", error: "TWILIO_AUTH_TOKEN is required." };
    }
    if (!this.from) {
      return { provider: this.name, status: "failed", error: "TWILIO_FROM is required." };
    }
    if (!to) {
      return { provider: this.name, status: "failed", error: "SMS recipient number is required." };
    }

    const params = new URLSearchParams({
      To: to,
      From: this.from,
      Body: message || "",
    });
    if (process.env.TWILIO_STATUS_CALLBACK_URL) {
      params.set("StatusCallback", process.env.TWILIO_STATUS_CALLBACK_URL);
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        provider: this.name,
        status: "failed",
        error: payload.message || `Twilio returned HTTP ${response.status}.`,
      };
    }

    return {
      provider: this.name,
      status: payload.status || "sent",
      id: payload.sid || null,
      to,
      metadata: metadata || null,
    };
  }
}
