import { getDb } from "../db/connection.js";

const KEYS = {
  emailProvider: "communications.email_provider",
  sendgridApiKey: "communications.sendgrid_api_key",
  emailFrom: "communications.email_from",
  emailReplyTo: "communications.email_reply_to",
  smsProvider: "communications.sms_provider",
  twilioAccountSid: "communications.twilio_account_sid",
  twilioAuthToken: "communications.twilio_auth_token",
  twilioFrom: "communications.twilio_from",
};

function getSetting(db, key, defaultValue = null) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return typeof row?.value === "string" ? row.value : defaultValue;
}

function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value)
     VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ key, value: value ?? "" });
}

function settingOrEnv(db, key, envKey, defaultValue = "") {
  return getSetting(db, key, process.env[envKey] ?? defaultValue);
}

export function getCommunicationProviderConfig() {
  const db = getDb();
  return {
    emailProvider: settingOrEnv(db, KEYS.emailProvider, "EMAIL_PROVIDER", "mock"),
    sendgridApiKey: settingOrEnv(db, KEYS.sendgridApiKey, "SENDGRID_API_KEY", ""),
    emailFrom: settingOrEnv(db, KEYS.emailFrom, "EMAIL_FROM", ""),
    emailReplyTo: settingOrEnv(db, KEYS.emailReplyTo, "EMAIL_REPLY_TO", ""),
    smsProvider: settingOrEnv(db, KEYS.smsProvider, "SMS_PROVIDER", "mock"),
    twilioAccountSid: settingOrEnv(db, KEYS.twilioAccountSid, "TWILIO_ACCOUNT_SID", ""),
    twilioAuthToken: settingOrEnv(db, KEYS.twilioAuthToken, "TWILIO_AUTH_TOKEN", ""),
    twilioFrom: settingOrEnv(db, KEYS.twilioFrom, "TWILIO_FROM", ""),
  };
}

export function getCommunicationSettings() {
  const config = getCommunicationProviderConfig();
  return {
    emailProvider: config.emailProvider,
    emailFrom: config.emailFrom,
    emailReplyTo: config.emailReplyTo,
    hasSendgridApiKey: Boolean(config.sendgridApiKey),
    smsProvider: config.smsProvider,
    twilioFrom: config.twilioFrom,
    hasTwilioAccountSid: Boolean(config.twilioAccountSid),
    hasTwilioAuthToken: Boolean(config.twilioAuthToken),
  };
}

export function updateCommunicationSettings(data) {
  const db = getDb();
  const run = db.transaction(() => {
    if (Object.prototype.hasOwnProperty.call(data, "emailProvider")) {
      setSetting(db, KEYS.emailProvider, data.emailProvider || "mock");
    }
    if (Object.prototype.hasOwnProperty.call(data, "emailFrom")) {
      setSetting(db, KEYS.emailFrom, data.emailFrom || "");
    }
    if (Object.prototype.hasOwnProperty.call(data, "emailReplyTo")) {
      setSetting(db, KEYS.emailReplyTo, data.emailReplyTo || "");
    }
    if (data.sendgridApiKey) {
      setSetting(db, KEYS.sendgridApiKey, data.sendgridApiKey);
    }
    if (Object.prototype.hasOwnProperty.call(data, "smsProvider")) {
      setSetting(db, KEYS.smsProvider, data.smsProvider || "mock");
    }
    if (Object.prototype.hasOwnProperty.call(data, "twilioFrom")) {
      setSetting(db, KEYS.twilioFrom, data.twilioFrom || "");
    }
    if (data.twilioAccountSid) {
      setSetting(db, KEYS.twilioAccountSid, data.twilioAccountSid);
    }
    if (data.twilioAuthToken) {
      setSetting(db, KEYS.twilioAuthToken, data.twilioAuthToken);
    }
  });
  run();
  return getCommunicationSettings();
}
