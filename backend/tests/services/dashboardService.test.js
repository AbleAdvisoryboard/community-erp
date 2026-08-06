import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDashboardSnapshot } from "../../services/dashboardService.js";
import { useTestDatabase } from "../utils/db.js";

let dbHandle;

beforeAll(() => {
  dbHandle = useTestDatabase({ seed: true });
});

afterAll(() => {
  dbHandle?.cleanup();
});

describe("dashboard service", () => {
  it("returns numeric aggregates", () => {
    const snapshot = getDashboardSnapshot();
    expect(typeof snapshot.fundraising.monthToDate.total).toBe("number");
    expect(typeof snapshot.finance.cashOnHand).toBe("number");
    expect(typeof snapshot.volunteers.hoursThisMonth).toBe("number");
    expect(typeof snapshot.events.upcomingEvents).toBe("number");
  });
});
