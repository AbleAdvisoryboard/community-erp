export function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(422).json({
        message: "Validation failed",
        details: error.details.map((d) => d.message),
      });
    }
    req.body = value;
    return next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(422).json({
        message: "Validation failed",
        details: error.details.map((d) => d.message),
      });
    }
    req.query = value;
    return next();
  };
}

export function validate(zodSchema) {
  return (req, res, next) => {
    try {
      const result = zodSchema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.valid = result;
      if (result.body) req.body = result.body;
      if (result.query) req.query = result.query;
      if (result.params) req.params = result.params;
      next();
    } catch (err) {
      if (err?.issues) {
        return res.status(422).json({
          message: 'Validation failed',
          details: err.issues.map((issue) => issue.message),
        });
      }
      next(err);
    }
  };
}