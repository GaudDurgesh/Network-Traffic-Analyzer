export function validatePagination(req, res, next) {
  const limitText = req.query.limit ?? "20";
  const offsetText = req.query.offset ?? "0";

  const isIntegerText = (value) =>
    typeof value === "string" && /^\d+$/.test(value);

  if (!isIntegerText(limitText) || !isIntegerText(offsetText)) {
    return res.status(400).json({
      error: "limit and offset must be whole numbers."
    });
  }

  const limit = Number(limitText);
  const offset = Number(offsetText);

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    return res.status(400).json({
      error: "limit must be 1–100 and offset must be a non-negative safe integer."
    });
  }

  res.locals.pagination = { limit, offset };
  next();
}