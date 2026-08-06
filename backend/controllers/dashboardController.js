import { getDashboardSnapshot } from "../services/dashboardService.js";

export function getDashboard(req, res, next) {
  try {
    const snapshot = getDashboardSnapshot();
    res.json({ data: snapshot });
  } catch (error) {
    next(error);
  }
}
