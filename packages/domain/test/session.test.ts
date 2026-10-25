import assert from "node:assert/strict";
import test from "node:test";
import { getSession } from "../src/session.js";

test("Sunday morning in New York is closed", () => {
  const session = getSession(new Date("2026-10-25T04:31:00.000Z"));
  assert.equal(session.name, "closed");
  assert.equal(session.label, "Closed");
  assert.equal(session.date, "2026-10-25");
  assert.equal(session.clock, "00:31:00");
  assert.equal(session.timezone, "America/New_York");
});

test("weekday session boundaries use the New York clock", () => {
  assert.equal(getSession(new Date("2026-10-26T07:59:00.000Z")).name, "closed");
  assert.equal(getSession(new Date("2026-10-26T08:00:00.000Z")).name, "pre-market");
  assert.equal(getSession(new Date("2026-10-26T13:29:00.000Z")).name, "pre-market");
  assert.equal(getSession(new Date("2026-10-26T13:30:00.000Z")).name, "regular");
  assert.equal(getSession(new Date("2026-10-26T19:59:00.000Z")).name, "regular");
  assert.equal(getSession(new Date("2026-10-26T20:00:00.000Z")).name, "after-hours");
  assert.equal(getSession(new Date("2026-10-26T23:59:00.000Z")).name, "after-hours");
  assert.equal(getSession(new Date("2026-10-27T00:00:00.000Z")).name, "closed");
});

test("winter hours stay on the New York clock", () => {
  assert.equal(getSession(new Date("2026-01-05T13:30:00.000Z")).name, "pre-market");
  assert.equal(getSession(new Date("2026-01-05T14:30:00.000Z")).name, "regular");
});

test("Saturday is closed during the weekday regular window", () => {
  assert.equal(getSession(new Date("2026-10-24T14:00:00.000Z")).name, "closed");
});
