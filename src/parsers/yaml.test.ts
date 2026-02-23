import { describe, test, expect } from "bun:test";
import { yamlParser } from "./yaml.ts";

describe("yamlParser", () => {
  const sample = `# Config file
database:
  host: localhost
  password: s3cret
api:
  key: abc123
`;

  test("parse flattens to dot-paths", () => {
    const result = yamlParser.parse(sample);
    expect(result).toEqual({
      "database.host": "localhost",
      "database.password": "s3cret",
      "api.key": "abc123",
    });
  });

  test("extract filters by patterns", () => {
    const result = yamlParser.extract(sample, ["database.*"]);
    expect(result).toEqual({
      "database.host": "localhost",
      "database.password": "s3cret",
    });
  });

  test("merge preserves comments", () => {
    const merged = yamlParser.merge(sample, { "database.password": "new_pass" });
    expect(merged).toContain("# Config file");
    expect(merged).toContain("new_pass");
    expect(merged).toContain("localhost");
  });
});
