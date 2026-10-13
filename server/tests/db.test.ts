import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectToDb, disconnectFromDb } from "../src/config/db";

describe("Database Connection Retry Mechanism", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await disconnectFromDb();
  });

  it("should retry the specified number of times with delay before throwing on failure", async () => {
    const connectSpy = vi.spyOn(mongoose, "connect").mockRejectedValue(new Error("ECONNREFUSED"));

    const startTime = Date.now();
    // Test with 3 retries and 50ms delay for fast test execution
    await expect(
      connectToDb({
        uri: "mongodb://invalid-host:27017/test",
        maxRetries: 3,
        retryDelayMs: 50,
      })
    ).rejects.toThrow("ECONNREFUSED");

    const elapsed = Date.now() - startTime;

    // Should have called mongoose.connect exactly 3 times
    expect(connectSpy).toHaveBeenCalledTimes(3);
    // Should have waited at least 2 retry intervals (2 * 50ms = 100ms)
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it("should succeed if a retry attempt resolves successfully", async () => {
    const fakeMongoose = mongoose;
    const connectSpy = vi
      .spyOn(mongoose, "connect")
      .mockRejectedValueOnce(new Error("Temporary network glitch"))
      .mockResolvedValueOnce(fakeMongoose as unknown as typeof mongoose);

    const result = await connectToDb({
      uri: "mongodb://fake-host:27017/test",
      maxRetries: 3,
      retryDelayMs: 20,
    });

    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(result).toBe(fakeMongoose);
  });
});
