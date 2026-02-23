import { describe, test, expect } from "bun:test";
import { jsonParser } from "./json.ts";

describe("jsonParser", () => {
  const sample = JSON.stringify({
    database: { host: "localhost", password: "s3cret" },
    api: { key: "abc123", secret: "xyz" },
    simple: "value",
  }, null, 2);

  test("parse flattens to dot-paths", () => {
    const result = jsonParser.parse(sample);
    expect(result).toEqual({
      "database.host": "localhost",
      "database.password": "s3cret",
      "api.key": "abc123",
      "api.secret": "xyz",
      "simple": "value",
    });
  });

  test("extract filters by glob patterns", () => {
    const result = jsonParser.extract(sample, ["database.*"]);
    expect(result).toEqual({
      "database.host": "localhost",
      "database.password": "s3cret",
    });
  });

  test("merge sets keys in existing structure", () => {
    const merged = jsonParser.merge(sample, { "database.password": "new_pass" });
    const parsed = JSON.parse(merged);
    expect(parsed.database.password).toBe("new_pass");
    expect(parsed.database.host).toBe("localhost");
    expect(parsed.api.key).toBe("abc123");
  });
});
