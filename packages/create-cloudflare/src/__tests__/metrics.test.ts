import { CancelError } from "@cloudflare/cli/error";
import { hasSparrowSourceKey, sendEvent } from "helpers/sparrow";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { collectCLIOutput, normalizeOutput } from "../../../cli/test-util";
import { version as c3Version } from "../../package.json";
import {
	getDeviceId,
	getSessionId,
	getUserId,
	readMetricsConfig,
	writeMetricsConfig,
} from "../helpers/metrics-config";
import {
	createReporter,
	promiseWithResolvers,
	runTelemetryCommand,
} from "../metrics";

vi.mock("helpers/metrics-config");
vi.mock("helpers/sparrow");

describe("createReporter", () => {
	const deviceId = "test-device-id";
	const userId = "test-user-id";
	const sessionId = "session-id-for-test-only";
	const os = {
		platform: process.platform,
		arch: process.arch,
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(readMetricsConfig).mockReturnValue({
			c3permission: {
				enabled: true,
				date: new Date(),
			},
		});
		vi.mocked(getDeviceId).mockReturnValue(deviceId);
		vi.mocked(getUserId).mockReturnValue(userId);
		vi.mocked(getSessionId).mockReturnValue(sessionId);
		vi.mocked(hasSparrowSourceKey).mockReturnValue(true);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	test("sends started and completed event to sparrow if the promise resolves", async () => {
		const deferred = promiseWithResolvers<string>();
		const reporter = createReporter();
		const operation = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			startedProps: {
				args: {
					projectName: "app",
				},
			},
			promise: () => deferred.promise,
		});

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				c3Version,
				os,
				args: {
					projectName: "app",
				},
			},
		});
		expect(sendEvent).toBeCalledTimes(1);

		deferred.resolve("test result");

		vi.advanceTimersByTime(1234);

		await expect(operation).resolves.toBe("test result");

		expect(sendEvent).toBeCalledWith({
			event: "c3 session completed",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				c3Version,
				os,
				args: {
					projectName: "app",
				},
				durationMs: 1234,
			},
		});
		expect(sendEvent).toBeCalledTimes(2);
	});

	test("sends no event if no sparrow source key", async () => {
		vi.mocked(hasSparrowSourceKey).mockReturnValue(false);

		const deferred = promiseWithResolvers<string>();
		const reporter = createReporter();
		const operation = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			startedProps: {
				args: {
					projectName: "app",
				},
			},
			promise: () => deferred.promise,
		});

		expect(sendEvent).toBeCalledTimes(0);

		deferred.resolve("test result");

		await expect(operation).resolves.toBe("test result");
		expect(sendEvent).toBeCalledTimes(0);
	});

	test("sends started and cancelled event to sparrow if the promise reject with a CancelError", async () => {
		const deferred = promiseWithResolvers<string>();
		const reporter = createReporter();
		const operation = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			startedProps: {
				args: {
					projectName: "app",
				},
			},
			promise: () => deferred.promise,
		});

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				c3Version,
				os,
				args: {
					projectName: "app",
				},
			},
		});
		expect(sendEvent).toBeCalledTimes(1);

		deferred.reject(new CancelError("test cancel"));
		vi.advanceTimersByTime(1234);

		await expect(operation).rejects.toThrow(CancelError);

		expect(sendEvent).toBeCalledWith({
			event: "c3 session cancelled",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				c3Version,
				os,
				args: {
					projectName: "app",
				},
				durationMs: 1234,
			},
		});
		expect(sendEvent).toBeCalledTimes(2);
	});

	test("sends started and errored event to sparrow if the promise reject with a non CancelError", async () => {
		const deferred = promiseWithResolvers<string>();
		const reporter = createReporter();
		const process = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			startedProps: {
				args: { projectName: "app" },
			},
			promise: () => deferred.promise,
		});

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				c3Version,
				os,
				args: {
					projectName: "app",
				},
			},
		});
		expect(sendEvent).toBeCalledTimes(1);

		deferred.reject(new Error("test error"));
		vi.advanceTimersByTime(1234);

		await expect(process).rejects.toThrow(Error);

		expect(sendEvent).toBeCalledWith({
			event: "c3 session errored",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				c3Version,
				os,
				args: {
					projectName: "app",
				},
				durationMs: 1234,
				error: {
					message: "test error",
					stack: expect.any(String),
				},
			},
		});
		expect(sendEvent).toBeCalledTimes(2);
	});

	test("sends cancelled event if a SIGINT signal is recieved", async () => {
		const deferred = promiseWithResolvers<string>();
		const reporter = createReporter();

		const run = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			startedProps: {
				args: {
					projectName: "app",
				},
			},
			promise: () => deferred.promise,
		});

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				c3Version,
				os,
				args: {
					projectName: "app",
				},
			},
		});
		expect(sendEvent).toBeCalledTimes(1);

		process.emit("SIGINT", "SIGINT");
		vi.advanceTimersByTime(1234);

		await expect(run).rejects.toThrow(CancelError);

		expect(sendEvent).toBeCalledWith({
			event: "c3 session cancelled",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				c3Version,
				os,
				args: {
					projectName: "app",
				},
				durationMs: 1234,
			},
		});
		expect(sendEvent).toBeCalledTimes(2);
	});

	test("sends cancelled event if a SIGTERM signal is recieved", async () => {
		const deferred = promiseWithResolvers<string>();
		const reporter = createReporter();
		const run = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			startedProps: {
				args: {
					projectName: "app",
				},
			},
			promise: () => deferred.promise,
		});

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				c3Version,
				os,
				args: {
					projectName: "app",
				},
			},
		});
		expect(sendEvent).toBeCalledTimes(1);

		process.emit("SIGTERM", "SIGTERM");
		vi.advanceTimersByTime(1234);

		await expect(run).rejects.toThrow(CancelError);

		expect(sendEvent).toBeCalledWith({
			event: "c3 session cancelled",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				c3Version,
				os,
				args: {
					projectName: "app",
				},
				durationMs: 1234,
			},
		});
		expect(sendEvent).toBeCalledTimes(2);
	});
});

describe("runTelemetryCommand", () => {
	const std = collectCLIOutput();

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("run telemetry status when c3permission is disabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: false,
				date: new Date(),
			},
		});

		runTelemetryCommand("status");

		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Disabled

			"
		`);
	});

	test("run telemetry status when c3permission is enabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: true,
				date: new Date(),
			},
		});

		runTelemetryCommand("status");

		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Enabled

			"
		`);
	});

	test("run telemetry enable when c3permission is disabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: false,
				date: new Date(),
			},
		});

		runTelemetryCommand("enable");

		expect(writeMetricsConfig).toBeCalledWith({
			c3permission: {
				enabled: true,
				date: new Date(),
			},
		});
		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Enabled

			Create-Cloudflare telemetry is completely anonymous. Thank you for helping us improve the experience!
			"
		`);
	});

	test("run telemetry enable when c3permission is enabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: true,
				date: new Date(),
			},
		});

		runTelemetryCommand("enable");

		expect(writeMetricsConfig).not.toBeCalled();
		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Enabled

			Create-Cloudflare telemetry is completely anonymous. Thank you for helping us improve the experience!
			"
		`);
	});

	test("run telemetry disable when c3permission is enabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: true,
				date: new Date(),
			},
		});

		runTelemetryCommand("disable");

		expect(writeMetricsConfig).toBeCalledWith({
			c3permission: {
				enabled: false,
				date: new Date(),
			},
		});
		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Disabled

			Create-Cloudflare is no longer collecting anonymous usage data
			"
		`);
	});

	test("run telemetry disable when c3permission is disabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: false,
				date: new Date(),
			},
		});

		runTelemetryCommand("disable");

		expect(writeMetricsConfig).not.toBeCalled();
		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Disabled

			Create-Cloudflare is no longer collecting anonymous usage data
			"
		`);
	});
});
