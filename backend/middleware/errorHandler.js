export function notFoundHandler(_req, res) {
  res.status(404).json({ message: "Not found" });
}

export function errorHandler(err, _req, res, _next) {
  console.error("Unhandled error", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
}
