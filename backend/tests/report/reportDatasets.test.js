import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { getDb } from "../../db/connection.js";
import {
  datasetHelpers,
  getDataset,
  buildDatasetQuery,
  getDatasetMetadata,
  listDatasetMetadata,
} from "../../services/reportDatasets.js";
import { useTestDatabase } from "../utils/db.js";

let dbHandle;

beforeAll(() => {
  dbHandle = useTestDatabase({ seed: true });
});

afterAll(() => {
  dbHandle?.cleanup();
});

describe("report dataset helpers", () => {
  it("lists available datasets with metadata", () => {
    const datasets = listDatasetMetadata();
    expect(Array.isArray(datasets)).toBe(true);
    expect(datasets.length).toBeGreaterThan(0);
    expect(datasets.some((dataset) => dataset.key === "fundraising_donations")).toBe(true);
  });

  it("surfaces filter options sourced from the database", () => {
    const metadata = getDatasetMetadata("fundraising_donations");
    const paymentFilter = metadata.filters.find((filter) => filter.id === "payment_method");
    expect(paymentFilter).toBeDefined();
    expect(paymentFilter?.options?.map((option) => option.value)).toContain("ACH");
  });

  it("builds parameterized SQL respecting filters and limits", () => {
    const dataset = getDataset("fundraising_donations");
    const query = buildDatasetQuery(dataset, {
      columns: ["donation_id", "payment_method", "amount"],
      filters: { payment_method: "ACH" },
      limit: 10,
    });

    expect(query.sql).toMatch(/d\.payment_method = @payment_method_/);
    expect(query.limit).toBeLessThanOrEqual(10);

    const rows = getDb().prepare(query.sql).all(query.params);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.payment_method === "ACH")).toBe(true);
  });

  it("resolves relative date presets to ISO ranges", () => {
    const { resolveDatePreset } = datasetHelpers;
    const range = resolveDatePreset("last_30_days");
    expect(range).toBeDefined();
    expect(range?.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range?.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
