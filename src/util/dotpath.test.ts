import { describe, test, expect } from "bun:test";
import { flatten, unflatten, matchGlob, filterByPatterns } from "./dotpath.ts";

describe("flatten", () => {
  test("flattens nested object", () => {
    expect(flatten({ a: { b: 1, c: 2 } })).toEqual({ "a.b": "1", "a.c": "2" });
  });

  test("handles top-level values", () => {
    expect(flatten({ x: "hello" })).toEqual({ x: "hello" });
  });
});

describe("unflatten", () => {
  test("restores nested structure", () => {
    const result = unflatten({ "a.b": "1", "a.c": "2" });
    expect(result).toEqual({ a: { b: "1", c: "2" } });
  });
});

describe("matchGlob", () => {
  test("exact match", () => {
    expect(matchGlob("DB_HOST", "DB_HOST")).toBe(true);
    expect(matchGlob("DB_HOST", "DB_PORT")).toBe(false);
  });

  test("wildcard in flat key", () => {
    expect(matchGlob("API_KEY", "API_*")).toBe(true);
    expect(matchGlob("API_SECRET", "API_*")).toBe(true);
    expect(matchGlob("DB_HOST", "API_*")).toBe(false);
  });

  test("wildcard in dot-path", () => {
    expect(matchGlob("database.password", "database.*")).toBe(true);
    expect(matchGlob("api.key", "database.*")).toBe(false);
  });
});

describe("filterByPatterns", () => {
  test("filters matching keys", () => {
    const data = { "DB_HOST": "x", "DB_PORT": "y", "API_KEY": "z" };
    const result = filterByPatterns(data, ["DB_*"]);
    expect(result).toEqual({ DB_HOST: "x", DB_PORT: "y" });
  });
});
