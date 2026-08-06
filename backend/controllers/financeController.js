import {
  listGlAccounts,
  createGlAccount,
  createJournal,
  listJournals,
  getTrialBalance,
  getBalanceSheet,
  getIncomeStatement,
  getFinancialOverview,
  getNonprofitStatement,
  getBalanceSheetClassified,
  deleteGlAccount,
  updateGlAccount,
} from "../services/financeService.js";

export function getGlAccounts(req, res, next) {
  try {
    const accounts = listGlAccounts({ type: req.query.type });
    res.json({ data: accounts });
  } catch (error) {
    next(error);
  }
}

export function postGlAccount(req, res, next) {
  try {
    const account = createGlAccount(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: account });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Account code must be unique" });
    }
    next(error);
  }
}

export function postJournal(req, res, _next) {
  try {
    const journal = createJournal(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: journal });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export function getJournals(req, res, next) {
  try {
    const { limit, offset, from, to, source, search } = req.query;
    const entries = listJournals({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      from,
      to,
      source,
      search,
    });
    res.json({ data: entries });
  } catch (error) {
    next(error);
  }
}

export function getTrialBalanceReport(req, res, next) {
  try {
    const { as_of, fund_id, class_id } = req.query || {};
    const rows = getTrialBalance({
      asOf: as_of || undefined,
      fundId: fund_id ? Number(fund_id) : undefined,
      classId: class_id ? Number(class_id) : undefined,
    });
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
}

export function removeGlAccount(req, res, _next) {
  try {
    const id = Number(req.params.id);
    const result = deleteGlAccount(id);
    res.json({ data: result });
  } catch (error) {
    const message = error.message || 'Failed to delete account';
    res.status(400).json({ message });
  }
}

export function patchGlAccount(req, res, _next) {
  try {
    const id = Number(req.params.id);
    const account = updateGlAccount(id, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data: account });
  } catch (error) {
    const message = error.message || 'Failed to update account';
    res.status(400).json({ message });
  }
}

export function getBalanceSheetReport(_req, res, next) {
  try {
    const data = getBalanceSheet();
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function getIncomeStatementReport(_req, res, next) {
  try {
    const data = getIncomeStatement();
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function getFinancialOverviewReport(req, res, next) {
  try {
    const { as_of } = req.query || {};
    const data = getFinancialOverview({ asOf: as_of });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function getNonprofitStatementReport(req, res, next) {
  try {
    const { as_of } = req.query || {};
    const data = getNonprofitStatement({ asOf: as_of });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function getBalanceSheetClassifiedReport(req, res, next) {
  try {
    const { as_of } = req.query || {};
    const data = getBalanceSheetClassified({ asOf: as_of });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}
