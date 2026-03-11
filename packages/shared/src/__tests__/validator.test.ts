import { describe, it, expect } from 'vitest';
import { validateAndBuildQuery } from '../validator';

describe('validateAndBuildQuery', () => {

  it("builds valid COUNT query", () => {
    const result = validateAndBuildQuery({
      aggregate: "COUNT",
      column: "amount",
      submitter: "analyst1",
    });

    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.sql).toBe("SELECT COUNT(amount) FROM transactions");
    }
  });

  it("builds SUM with grouping", () => {
    const result = validateAndBuildQuery({
      aggregate: "SUM",
      column: "amount",
      grouping: "region",
      submitter: "analyst1",
    });

    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.sql).toBe(
        "SELECT region, SUM(amount) FROM transactions GROUP BY region"
      );
    }
  });

  it("Builds AVG with SUM+COUNT", () => {
    const result = validateAndBuildQuery({
      aggregate: "AVG",
      column: "amount",
      submitter: "analyst1",
    });

    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.sql).toBe(
        "SELECT SUM(amount) AS sum, COUNT(amount) AS count FROM transactions"
      );
    }
  });

  it("builds query with valid filters", () => {
    const result = validateAndBuildQuery({
      aggregate: "SUM",
      column: "amount",
      filter: [
        { column: "region", operator: "=", value: "North" },
        { column: "category", operator: "=", value: "Food" },
      ],
      submitter: "analyst1",
    });

    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.sql).toContain("WHERE");
      expect(result.sql).toContain("region = 'North'");
      expect(result.sql).toContain("category = 'Food'");
    }
  });

  it("supports all aggregate types", () => {
    const aggregates = ["SUM", "COUNT", "AVG", "MAX", "MIN"] as const;

    for (const agg of aggregates) {
      const result = validateAndBuildQuery({
        aggregate: agg,
        column: "amount",
        submitter: "analyst1",
      });

      expect(result.valid).toBe(true);
    }
  });

  it("rejects unknown aggregate", () => {
    const result = validateAndBuildQuery({
      aggregate: "MEDIAN" as any,
      column: "amount",
      submitter: "analyst1",
    });

    expect(result.valid).toBe(false);

    if (!result.valid) {
      expect(result.error).toContain("Unsupported aggregate");
    }
  });

  it("rejects unknown column", () => {
    const result = validateAndBuildQuery({
      aggregate: "SUM",
      column: "ssn",
      submitter: "analyst1",
    });

    expect(result.valid).toBe(false);
  });

  it("rejects unknown grouping column", () => {
    const result = validateAndBuildQuery({
      aggregate: "SUM",
      column: "amount",
      grouping: "zipcode",
      submitter: "analyst1",
    });

    expect(result.valid).toBe(false);
  });

  it("rejects filter on unknown column", () => {
    const result = validateAndBuildQuery({
      aggregate: "SUM",
      column: "amount",
      filter: [{ column: "ssn", operator: "=", value: "123" }],
      submitter: "analyst1",
    });

    expect(result.valid).toBe(false);
  });

  it("rejects SQL injection-like column name", () => {
    const result = validateAndBuildQuery({
      aggregate: "SUM",
      column: "amount; DROP TABLE users;",
      submitter: "analyst1",
    });

    expect(result.valid).toBe(false);
  });

});