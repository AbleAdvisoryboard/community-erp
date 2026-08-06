import { listBills, createBill, applyBillPayment, getApAging } from "../services/apService.js";

export function getBills(req, res, next) {
  try {
    const { status, vendorAccountId, limit, offset } = req.query;
    const data = listBills({
      status,
      vendorAccountId: vendorAccountId ? Number(vendorAccountId) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json({ data });
  } catch (err) { next(err); }
}

export function postBill(req, res, _next) {
  try {
    const bill = createBill(req.body, { userId: req.user?.id, ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ data: bill });
  } catch (err) { res.status(400).json({ message: err.message }); }
}

export function postBillPayment(req, res, _next) {
  try {
    const id = Number(req.params.id);
    const updated = applyBillPayment(id, req.body, { userId: req.user?.id, ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!updated) return res.status(404).json({ message: 'Bill not found' });
    res.status(201).json({ data: updated });
  } catch (err) { res.status(400).json({ message: err.message }); }
}

export function getApAgingReport(_req, res, next) {
  try { res.json({ data: getApAging() }); } catch (err) { next(err); }
}
