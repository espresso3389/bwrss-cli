import { describe, test, expect } from "bun:test";
import { tomlParser } from "./toml.ts";

describe("tomlParser", () => {
  const sample = `[database]
host = "localhost"
password = "s3cret"

[api]
key = "abc123"
`;

  test("parse flattens to dot-paths", () => {
    const result = tomlParser.parse(sample);
    expect(result).toEqual({
      "database.host": "localhost",
      "database.password": "s3cret",
      "api.key": "abc123",
    });
  });

  test("extract filters by patterns", () => {
    const result = tomlParser.extract(sample, ["database.*"]);
    expect(result).toEqual({
      "database.host": "localhost",
      "database.password": "s3cret",
    });
  });

  test("merge updates keys in structure", () => {
    const merged = tomlParser.merge(sample, { "database.password": "new_pass" });
    expect(merged).toContain("new_pass");
    expect(merged).toContain("localhost");
  });
});
