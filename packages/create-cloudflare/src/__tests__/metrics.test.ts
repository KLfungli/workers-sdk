import { CancelError } from "@cloudflare/cli/error";
import { sendEvent } from "helpers/sparrow";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { collectCLIOutput, normalizeOutput } from "../../../cli/test-util";
import {
	getDeviceId,
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
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	test("sends started and completed event to sparrow if the promise resolves", async () => {
		const { resolve, promise } = promiseWithResolvers<string>();
		const reporter = createReporter();
		const process = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			props: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
			promise: () => promise,
		});

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
		});
		expect(sendEvent).toBeCalledTimes(1);

		resolve("test result");

		await expect(process).resolves.toBe("test result");

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
		});
		expect(sendEvent).toBeCalledTimes(2);
	});

	test("sends started and cancelled event to sparrow if the promise reject with a CancelError", async () => {
		const { reject, promise } = promiseWithResolvers<string>();
		const reporter = createReporter();
		const process = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			props: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
			promise: () => promise,
		});

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
		});
		expect(sendEvent).toBeCalledTimes(1);

		reject(new CancelError("test cancel"));

		await expect(process).rejects.toThrow(CancelError);

		expect(sendEvent).toBeCalledWith({
			event: "c3 session cancelled",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
		});
		expect(sendEvent).toBeCalledTimes(2);
	});

	test("sends started and errored event to sparrow if the promise reject with a non CancelError", async () => {
		const { reject, promise } = promiseWithResolvers<string>();
		const reporter = createReporter();
		const process = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			props: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
			promise: () => promise,
		});

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
		});
		expect(sendEvent).toBeCalledTimes(1);

		reject(new Error("test error"));

		await expect(process).rejects.toThrow(Error);

		expect(sendEvent).toBeCalledWith({
			event: "c3 session errored",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
				error: {
					message: "test error",
					stack: expect.any(String),
				},
			},
		});
		expect(sendEvent).toBeCalledTimes(2);
	});

	test("sends cancelled event if a SIGINT signal is recieved", async () => {
		const { promise } = promiseWithResolvers<string>();
		const reporter = createReporter();

		const run = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			props: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
			promise: () => promise,
		});

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
		});
		expect(sendEvent).toBeCalledTimes(1);

		process.emit("SIGINT", "SIGINT");

		await expect(run).rejects.toThrow(CancelError);

		expect(sendEvent).toBeCalledWith({
			event: "c3 session cancelled",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
		});
		expect(sendEvent).toBeCalledTimes(2);
	});

	test("sends cancelled event if a SIGTERM signal is recieved", async () => {
		const { promise } = promiseWithResolvers<string>();
		const reporter = createReporter();
		const run = reporter.collectAsyncMetrics({
			eventPrefix: "c3 session",
			props: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
			promise: () => promise,
		});

		expect(sendEvent).toBeCalledWith({
			event: "c3 session started",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
			},
		});
		expect(sendEvent).toBeCalledTimes(1);

		process.emit("SIGTERM", "SIGTERM");

		await expect(run).rejects.toThrow(CancelError);

		expect(sendEvent).toBeCalledWith({
			event: "c3 session cancelled",
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId: "example",
				c3Version: "1.2.3",
				os: { platform: "cf", arch: "test" },
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
