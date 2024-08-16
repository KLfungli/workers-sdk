// Copied from packages/wrangler/src/metrics/metrics-config.ts
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getConfigCache } from "./config-cache";
import { getGlobalWranglerConfigPath } from "./global-wrangler-config-path";

export const USER_ID_CACHE_PATH = "user-id.json";

/**
 * Stringify and write the given info to the metrics config file.
 */
export function writeMetricsConfig(config: MetricsConfigFile) {
	mkdirSync(path.dirname(getMetricsConfigPath()), { recursive: true });
	writeFileSync(
		getMetricsConfigPath(),
		JSON.stringify(
			config,
			(_key, value) => (value instanceof Date ? value.toISOString() : value),
			"\t",
		),
	);
}

/**
 * Read and parse the metrics config file.
 */
export function readMetricsConfig(): MetricsConfigFile {
	try {
		const config = readFileSync(getMetricsConfigPath(), "utf8");
		return JSON.parse(config, (key, value) =>
			key === "date" ? new Date(value) : value,
		);
	} catch {
		return {};
	}
}

/**
 * Get the path to the metrics config file.
 */
function getMetricsConfigPath(): string {
	return path.resolve(getGlobalWranglerConfigPath(), "metrics.json");
}

/**
 * The format of the metrics config file.
 */
export interface MetricsConfigFile {
	permission?: {
		/** True if Wrangler should send metrics to Cloudflare. */
		enabled: boolean;
		/** The date that this permission was set. */
		date: Date;
	};
	c3permission?: {
		/** True if c3 should send metrics to Cloudflare. */
		enabled: boolean;
		/** The date that this permission was set. */
		date: Date;
	};
	/** A unique UUID that identifies this device for metrics purposes. */
	deviceId?: string;
}

/**
 * Returns an ID that uniquely identifies Wrangler on this device to help collate events.
 *
 * Once created this ID is stored in the metrics config file.
 * Note: This is modified to read the config directly.
 */
export function getDeviceId() {
	const config = readMetricsConfig();
	// Get or create the deviceId.
	const deviceId = config.deviceId ?? randomUUID();
	if (config.deviceId === undefined) {
		// We had to create a new deviceID so store it now.
		writeMetricsConfig({ ...config, deviceId });
	}
	return deviceId;
}

/**
 * Returns the ID of the current user, which will be sent with each event.
 *
 * Note: This is modified to look up the id from the cache only
 * as we have no access to user auth token to fetch the data.
 */
export function getUserId() {
	return getConfigCache<{ userId: string }>(USER_ID_CACHE_PATH).userId;
}

/**
 * Generate a new session ID.
 * @returns
 */
export function getSessionId() {
	return randomUUID();
}
