function createIdentifier(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class MockEmailProvider {
  constructor() {
    this.name = 'mock-email';
  }

  async sendEmail({ to, subject, html, text, metadata }) {
    if (!to) {
      return {
        provider: this.name,
        status: 'failed',
        error: 'Recipient address is required.',
      };
    }
    const deliveredAt = new Date().toISOString();
    return {
      provider: this.name,
      status: 'sent',
      id: createIdentifier('mock-mail'),
      to,
      subject,
      deliveredAt,
      metadata: metadata || null,
      html: html ? Boolean(html) : false,
      text: text ? Boolean(text) : false,
    };
  }
}

export class MockSmsProvider {
  constructor() {
    this.name = 'mock-sms';
  }

  async sendSms({ to, message, metadata }) {
    if (!to) {
      return {
        provider: this.name,
        status: 'failed',
        error: 'SMS recipient number is required.',
      };
    }
    return {
      provider: this.name,
      status: 'sent',
      id: createIdentifier('mock-sms'),
      to,
      deliveredAt: new Date().toISOString(),
      metadata: metadata || null,
      messagePreview: message?.slice(0, 120) || '',
    };
  }
}

export class MockPaymentProvider {
  constructor() {
    this.name = 'mock-payments';
  }

  async charge({ amount, currency, source, metadata }) {
    if (!source || !source.id) {
      return {
        provider: this.name,
        status: 'failed',
        error: 'Payment source is missing.',
      };
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return {
        provider: this.name,
        status: 'failed',
        error: 'Charge amount must be positive.',
      };
    }
    return {
      provider: this.name,
      status: 'succeeded',
      id: createIdentifier('mock-charge'),
      amount: Number(amount),
      currency: (currency || 'USD').toUpperCase(),
      processedAt: new Date().toISOString(),
      metadata: metadata || null,
      sourceSummary: source.last4 ? `****${source.last4}` : source.id,
    };
  }
}
