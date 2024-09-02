import { AsyncLocalStorage } from "async_hooks";
import { logRaw } from "@cloudflare/cli";
import { CancelError } from "@cloudflare/cli/error";
import {
	getDeviceId,
	getSessionId,
	getUserId,
	readMetricsConfig,
	writeMetricsConfig,
} from "helpers/metrics-config";
import * as sparrow from "helpers/sparrow";
import { version as c3Version } from "../package.json";
import type { Event } from "./event";

// A type to extract the prefix of event names sharing the same suffix
type EventPrefix<Suffix extends string> =
	Event["name"] extends `${infer Name} ${Suffix}` ? Name : never;

// A type to extract the properties of an event based on the name
type EventProperties<EventName extends Event["name"]> = Extract<
	Event,
	{ name: EventName }
>["properties"];

// A method returns an object containing a new Promise object and two functions to resolve or reject it.
// This can be replaced with `Promise.withResolvers()` when it is available
export function promiseWithResolvers<T>() {
	let resolve: ((value: T) => void) | undefined;
	let reject: ((reason?: unknown) => void) | undefined;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	if (!resolve || !reject) {
		throw new Error("Promise resolvers not set");
	}

	return { resolve, reject, promise };
}

export function createReporter() {
	const events: Array<Promise<void>> = [];
	const als = new AsyncLocalStorage<{
		setEventProperty: <
			EventName extends Event["name"],
			PropertyKey extends keyof EventProperties<EventName>,
		>(
			eventName: EventName,
			key: PropertyKey,
			value: EventProperties<EventName>[PropertyKey],
		) => void;
	}>();

	const sessionId = getSessionId();
	const config = readMetricsConfig();
	const telemetry = getC3Permission(config);
	const deviceId = getDeviceId(config);
	const os = {
		platform: process.platform,
		arch: process.arch,
	};

	function sendEvent<EventName extends Event["name"]>(
		name: EventName,
		properties: EventProperties<EventName>,
	): void {
		if (!telemetry.enabled || !sparrow.hasSparrowSourceKey()) {
			return;
		}

		// Get the latest userId everytime in case it is updated
		const userId = getUserId();
		const request = sparrow.sendEvent({
			event: name,
			deviceId,
			userId,
			timestamp: Date.now(),
			properties: {
				sessionId,
				os,
				c3Version,
				...properties,
			},
		});

		events.push(request);
	}

	async function waitForAllEventsSettled(): Promise<void> {
		await Promise.allSettled(events);
	}

	// Collect metrics for an async function
	// This tracks each stages of the async function and sends the corresonding event to sparrow
	async function collectAsyncMetrics<
		Prefix extends EventPrefix<
			"started" | "cancelled" | "errored" | "completed"
		>,
		Result,
	>(options: {
		eventPrefix: Prefix;
		startedProps: EventProperties<`${Prefix} started`>;
		disableTelemetry?: boolean;
		promise: () => Promise<Result>;
	}): Promise<Result> {
		// Create a new promise that will reject when the user interrupts the process
		const cancelDeferred = promiseWithResolvers<never>();
		const cancel = (signal?: NodeJS.Signals) => {
			cancelDeferred.reject(new CancelError(`Operation cancelled.`, signal));
		};

		const startTime = Date.now();
		const additionalProperties: {
			[key in Event["name"]]?: Partial<EventProperties<`${key}`>>;
		} = {};

		try {
			if (!options.disableTelemetry) {
				sendEvent(`${options.eventPrefix} started`, options.startedProps);
			}

			// Attach the SIGINT and SIGTERM event listeners to handle cancellation
			process.on("SIGINT", cancel).on("SIGTERM", cancel);

			const result = await Promise.race([
				als.run(
					{
						// This allows the promise to use the `setEventProperty` helper to
						// update the properties object sent to sparrow
						setEventProperty(eventName, key, value) {
							additionalProperties[eventName] ??= {};
							additionalProperties[eventName][key] = value;
						},
					},
					options.promise,
				),
				cancelDeferred.promise,
			]);

			if (!options.disableTelemetry) {
				sendEvent(`${options.eventPrefix} completed`, {
					...options.startedProps,
					...additionalProperties[`${options.eventPrefix} completed`],
					durationMs: Date.now() - startTime,
				});
			}

			return result;
		} catch (e) {
			if (!options.disableTelemetry) {
				const durationMs = Date.now() - startTime;

				if (e instanceof CancelError) {
					sendEvent(`${options.eventPrefix} cancelled`, {
						...options.startedProps,
						...additionalProperties[`${options.eventPrefix} cancelled`],
						durationMs,
					});
				} else {
					sendEvent(`${options.eventPrefix} errored`, {
						...options.startedProps,
						...additionalProperties[`${options.eventPrefix} errored`],
						durationMs,
						error: {
							message: e instanceof Error ? e.message : undefined,
							stack: e instanceof Error ? e.stack : undefined,
						},
					});
				}
			}

			// Rethrow the error so it can be caught by the caller
			throw e;
		} finally {
			// Clean up the event listeners
			process.off("SIGINT", cancel).off("SIGTERM", cancel);
		}
	}

	// To be used within `collectAsyncMetrics` to update the properties object sent to sparrow
	function setEventProperty<
		EventName extends Event["name"],
		PropertyKey extends keyof EventProperties<EventName>,
	>(
		eventName: EventName,
		key: PropertyKey,
		value: EventProperties<EventName>[PropertyKey],
	) {
		const store = als.getStore();

		if (!store) {
			throw new Error(
				"`setEventProperty` must be called within `collectAsyncMetrics`",
			);
		}

		return store.setEventProperty(eventName, key, value);
	}

	return {
		sendEvent,
		waitForAllEventsSettled,
		collectAsyncMetrics,
		setEventProperty,
	};
}

// A singleton instance of the reporter that can be imported and used across the codebase
export const reporter = createReporter();

export function initializeC3Permission(enabled = true) {
	return {
		enabled,
		date: new Date(),
	};
}

export function getC3Permission(config = readMetricsConfig() ?? {}) {
	if (!config.c3permission) {
		config.c3permission = initializeC3Permission();

		writeMetricsConfig(config);
	}

	return config.c3permission;
}

// To update the c3permission property in the metrics config
export function updateC3Pemission(enabled: boolean) {
	const config = readMetricsConfig();

	if (config.c3permission?.enabled === enabled) {
		// Do nothing if the enabled state is the same
		return;
	}

	config.c3permission = initializeC3Permission(enabled);

	writeMetricsConfig(config);
}

export const runTelemetryCommand = (
	action: "status" | "enable" | "disable",
) => {
	const logTelemetryStatus = (enabled: boolean) => {
		logRaw(`Status: ${enabled ? "Enabled" : "Disabled"}`);
		logRaw("");
	};

	switch (action) {
		case "enable": {
			updateC3Pemission(true);
			logTelemetryStatus(true);
			logRaw(
				"Create-Cloudflare telemetry is completely anonymous. Thank you for helping us improve the experience!",
			);
			break;
		}
		case "disable": {
			updateC3Pemission(false);
			logTelemetryStatus(false);
			logRaw("Create-Cloudflare is no longer collecting anonymous usage data");
			break;
		}
		case "status": {
			const telemetry = getC3Permission();

			logTelemetryStatus(telemetry.enabled);
			break;
		}
	}
};
