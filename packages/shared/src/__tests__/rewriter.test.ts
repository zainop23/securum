import { describe, it, expect } from "vitest";
import { rewriteQuery } from "../rewriter";

describe("rewriteQuery", () => {
  const schemaMap = {
    tables: { transactions: "sales" },
    columns: {
      amount: "total_amount",
      category: "product_type",
      region: "region",
      tx_date: "sale_date",
    },
  };

  it("rewrites table and aggregate column", () => {
    const result = rewriteQuery(
      "SELECT SUM(amount) FROM transactions",
      schemaMap
    );

    expect(result.sql).toBe("SELECT SUM(total_amount) FROM sales");
  });

  it("rewrites grouping and where columns", () => {
    const result = rewriteQuery(
      "SELECT region, SUM(amount) FROM transactions WHERE category = 'Food' GROUP BY region",
      schemaMap
    );

    expect(result.sql).toBe(
      "SELECT region, SUM(total_amount) FROM sales WHERE product_type = 'Food' GROUP BY region"
    );
  });

  it("returns correct reverseMap", () => {
    const result = rewriteQuery(
      "SELECT SUM(amount) FROM transactions",
      schemaMap
    );

    expect(result.reverseMap["total_amount"]).toBe("amount");
    expect(result.reverseMap["product_type"]).toBe("category");
    expect(result.reverseMap["region"]).toBe("region");
    expect(result.reverseMap["sale_date"]).toBe("tx_date");
  });

  it("does not corrupt substring columns", () => {
    const localMap = {
      tables: { transactions: "sales" },
      columns: { amount: "amt" },
    };

    const result = rewriteQuery(
      "SELECT total_amount, SUM(amount) FROM transactions",
      localMap
    );

    expect(result.sql).toBe("SELECT total_amount, SUM(amt) FROM sales");
  });

  it("handles identity mapping safely", () => {
    const identityMap = {
      tables: { transactions: "orders" },
      columns: { amount: "amount", category: "category" },
    };

    const result = rewriteQuery(
      "SELECT SUM(amount) FROM transactions WHERE category = 'Food'",
      identityMap
    );

    expect(result.sql).toBe(
      "SELECT SUM(amount) FROM orders WHERE category = 'Food'"
    );
  });
});