import {
  listFunds,
  createFund,
  updateFund,
  listCampaigns,
  createCampaign,
  updateCampaign,
  createAppeal,
  createDonation,
  listDonations,
  createPledge,
  issueReceipt,
  applyPledgePayment,
} from "../services/fundraisingService.js";

export function getFunds(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const funds = listFunds({ includeInactive });
    res.json({ data: funds });
  } catch (err) {
    next(err);
  }
}

export function postFund(req, res, next) {
  try {
    const fund = createFund(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: fund });
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Fund code must be unique" });
    }
    next(err);
  }
}

export function patchFund(req, res, next) {
  try {
    const fundId = Number(req.params.id);
    const fund = updateFund(fundId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!fund) {
      return res.status(404).json({ message: "Fund not found" });
    }
    res.json({ data: fund });
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Fund code must be unique" });
    }
    next(err);
  }
}

export function getCampaigns(req, res, next) {
  try {
    const campaigns = listCampaigns({
      status: req.query.status,
      includeInactive: req.query.includeInactive === "true",
    });
    res.json({ data: campaigns });
  } catch (err) {
    next(err);
  }
}

export function postCampaign(req, res, next) {
  try {
    const campaign = createCampaign(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: campaign });
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Campaign code must be unique" });
    }
    next(err);
  }
}

export function patchCampaign(req, res, next) {
  try {
    const campaignId = Number(req.params.id);
    const campaign = updateCampaign(campaignId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }
    res.json({ data: campaign });
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Campaign code must be unique" });
    }
    next(err);
  }
}

export function postAppeal(req, res, next) {
  try {
    const appeal = createAppeal(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: appeal });
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Appeal code must be unique" });
    }
    next(err);
  }
}

export async function postDonation(req, res, next) {
  try {
    const donation = await createDonation(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: donation });
  } catch (err) {
    next(err);
  }
}

export function getDonations(req, res, next) {
  try {
    const { from, to, campaignId, fundId, accountId, contactId, minAmount, maxAmount, limit, offset } = req.query;
    const donations = listDonations({
      from,
      to,
      campaignId: campaignId ? Number(campaignId) : undefined,
      fundId: fundId ? Number(fundId) : undefined,
      accountId: accountId ? Number(accountId) : undefined,
      contactId: contactId ? Number(contactId) : undefined,
      minAmount: typeof minAmount !== "undefined" ? Number(minAmount) : undefined,
      maxAmount: typeof maxAmount !== "undefined" ? Number(maxAmount) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json({ data: donations });
  } catch (err) {
    next(err);
  }
}

export function postPledge(req, res, next) {
  try {
    const pledge = createPledge(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: pledge });
  } catch (err) {
    next(err);
  }
}

export function postDonationReceipt(req, res, next) {
  try {
    const donationId = Number(req.params.id);
    const receipt = issueReceipt(donationId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!receipt) {
      return res.status(404).json({ message: "Donation not found" });
    }
    res.status(201).json({ data: receipt });
  } catch (err) {
    next(err);
  }
}

export function postPledgePayment(req, res, _next) {
  try {
    const donationId = Number(req.params.id);
    const updated = applyPledgePayment(donationId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!updated) {
      return res.status(404).json({ message: "Donation not found" });
    }
    res.status(201).json({ data: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}
