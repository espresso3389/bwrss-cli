import { describe, test, expect } from "bun:test";
import { iniParser } from "./ini.ts";

describe("iniParser", () => {
  const sample = `# Database config
DB_HOST=localhost
DB_PORT=5432
DB_PASSWORD="s3cret"
API_KEY='abc123'
API_SECRET=xyz789
EMPTY=
`;

  test("parse extracts all key-value pairs", () => {
    const result = iniParser.parse(sample);
    expect(result).toEqual({
      DB_HOST: "localhost",
      DB_PORT: "5432",
      DB_PASSWORD: "s3cret",
      API_KEY: "abc123",
      API_SECRET: "xyz789",
      EMPTY: "",
    });
  });

  test("extract filters by glob patterns", () => {
    const result = iniParser.extract(sample, ["DB_*"]);
    expect(result).toEqual({
      DB_HOST: "localhost",
      DB_PORT: "5432",
      DB_PASSWORD: "s3cret",
    });
  });

  test("extract with specific key", () => {
    const result = iniParser.extract(sample, ["API_KEY"]);
    expect(result).toEqual({ API_KEY: "abc123" });
  });

  test("merge updates existing keys and preserves comments", () => {
    const merged = iniParser.merge(sample, {
      DB_PASSWORD: "new_password",
      NEW_KEY: "new_value",
    });
    expect(merged).toContain("# Database config");
    expect(merged).toContain("DB_PASSWORD=new_password");
    expect(merged).toContain("DB_HOST=localhost");
    expect(merged).toContain("NEW_KEY=new_value");
    expect(merged).not.toContain("s3cret");
  });
});
