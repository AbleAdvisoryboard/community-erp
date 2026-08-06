import { createInvoice, listInvoices, applyInvoicePayment, getAging } from "../services/arService.js";

export function getInvoices(req, res, next) {
  try {
    const { status, accountId, limit, offset, from, to } = req.query;
    const rows = listInvoices({
      status,
      accountId: accountId ? Number(accountId) : undefined,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

export function postInvoice(req, res, _next) {
  try {
    const invoice = createInvoice(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: invoice });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export function postInvoicePayment(req, res, _next) {
  try {
    const id = Number(req.params.id);
    const updated = applyInvoicePayment(id, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!updated) return res.status(404).json({ message: "Invoice not found" });
    res.status(201).json({ data: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export function getAgingReport(_req, res, next) {
  try {
    const rows = getAging();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}
