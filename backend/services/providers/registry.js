import { MockEmailProvider, MockSmsProvider, MockPaymentProvider } from "./mockProviders.js";
import { SendGridEmailProvider } from "./sendgridProvider.js";
import { TwilioSmsProvider } from "./twilioProvider.js";
import { getCommunicationProviderConfig } from "../communicationSettingsService.js";

let registryCache = null;

function resolveProvider(providerKey, factory, fallbackFactory) {
  if (!providerKey) return fallbackFactory();
  const key = providerKey.trim().toLowerCase();
  switch (key) {
    case 'mock':
      return factory();
    default:
      return fallbackFactory();
  }
}

function createEmailProvider(config) {
  const key = (config.emailProvider || "mock").trim().toLowerCase();
  if (key === "sendgrid") {
    return new SendGridEmailProvider({
      apiKey: config.sendgridApiKey,
      from: config.emailFrom,
      replyTo: config.emailReplyTo,
    });
  }
  return new MockEmailProvider();
}

function createSmsProvider(config) {
  const key = (config.smsProvider || "mock").trim().toLowerCase();
  if (key === "twilio") {
    return new TwilioSmsProvider({
      accountSid: config.twilioAccountSid,
      authToken: config.twilioAuthToken,
      from: config.twilioFrom,
    });
  }
  return new MockSmsProvider();
}

function createProviders() {
  const config = getCommunicationProviderConfig();
  const emailProvider = createEmailProvider(config);
  const smsProvider = createSmsProvider(config);
  const paymentProvider = resolveProvider(process.env.PAYMENT_PROVIDER, () => new MockPaymentProvider(), () => new MockPaymentProvider());

  return {
    email: emailProvider,
    sms: smsProvider,
    payment: paymentProvider,
  };
}

export function getProviderRegistry() {
  if (!registryCache) {
    registryCache = createProviders();
  }
  return registryCache;
}

export function resetProviderRegistry() {
  registryCache = null;
}
