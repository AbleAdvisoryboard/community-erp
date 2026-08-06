import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount as deleteAccountService,
  searchContacts,
  createContact,
  updateContact as updateContactService,
  deleteContact as deleteContactService,
  createActivity,
  listContactTags,
  createContactTag,
  deleteContactTag as deleteContactTagService,
} from "../services/crmService.js";

export function getAccounts(req, res, next) {
  try {
    const { search, limit, offset, includeInactive } = req.query;
    const accounts = listAccounts({
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      includeInactive: includeInactive === "true",
    });
    res.json({ data: accounts });
  } catch (err) {
    next(err);
  }
}

export function deleteAccount(req, res, next) {
  try {
    const accountId = Number(req.params.id);
    const deleted = deleteAccountService(accountId, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!deleted) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({ data: deleted });
  } catch (err) {
    next(err);
  }
}

export function postAccount(req, res, next) {
  try {
    const account = createAccount(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: account });
  } catch (err) {
    next(err);
  }
}

export function patchAccount(req, res, next) {
  try {
    const accountId = Number(req.params.id);
    const updated = updateAccount(accountId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!updated) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}

export function getContacts(req, res, next) {
  try {
    const { query, q, accountId, tag, primary, isPrimary, limit, offset } = req.query;
    const effectiveQuery = q ?? query;
    const contacts = searchContacts({
      query: effectiveQuery,
      accountId: accountId ? Number(accountId) : undefined,
      tag,
      isPrimary: typeof primary !== 'undefined'
        ? String(primary).toLowerCase() === 'true'
        : (typeof isPrimary !== 'undefined' ? String(isPrimary).toLowerCase() === 'true' : undefined),
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json({ data: contacts });
  } catch (err) {
    next(err);
  }
}

export function postContact(req, res, next) {
  try {
    const contact = createContact(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[CONTACT:CREATE]", contact.id);
    }
    res.status(201).json({ data: contact });
  } catch (err) {
    if (err.code === "DUPLICATE_CONTACT") {
      return res.status(409).json({ message: err.message });
    }
    next(err);
  }
}

export function patchContact(req, res, next) {
  try {
    const contactId = Number(req.params.id);
    const updated = updateContactService(contactId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!updated) {
      return res.status(404).json({ message: "Contact not found" });
    }
    res.json({ data: updated });
  } catch (err) {
    if (err.code === "DUPLICATE_CONTACT") {
      return res.status(409).json({ message: err.message });
    }
    next(err);
  }
}

export function deleteContact(req, res, next) {
  try {
    const contactId = Number(req.params.id);
    const deleted = deleteContactService(contactId, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!deleted) {
      return res.status(404).json({ message: "Contact not found" });
    }
    res.json({ data: deleted });
  } catch (err) {
    next(err);
  }
}

export function postActivity(req, res, next) {
  try {
    const activity = createActivity(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: activity });
  } catch (err) {
    next(err);
  }
}

export function getContactTags(_req, res, next) {
  try {
    const tags = listContactTags();
    res.json({ data: tags });
  } catch (err) {
    next(err);
  }
}

export function postContactTag(req, res, next) {
  try {
    const { name } = req.body || {};
    const tag = createContactTag(name, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: tag });
  } catch (err) {
    if (err.code === "VALIDATION_ERROR") {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
}

export function deleteContactTag(req, res, next) {
  try {
    const tagId = Number(req.params.id);
    const deleted = deleteContactTagService(tagId, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!deleted) {
      return res.status(404).json({ message: "Tag not found" });
    }
    res.json({ data: deleted });
  } catch (err) {
    next(err);
  }
}
