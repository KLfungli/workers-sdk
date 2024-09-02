import { fetch } from "undici";

// The SPARROW_SOURCE_KEY is provided at esbuild time as a `define` for production and beta
// releases. Otherwise it is left undefined, which automatically disables metrics requests.
declare const SPARROW_SOURCE_KEY: string;
const SPARROW_URL = "https://sparrow.cloudflare.com";

export type EventPayload = {
	event: string;
	deviceId: string;
	userId: string | undefined;
	timestamp: number | undefined;
	properties: Record<string, unknown>;
};

export function hasSparrowSourceKey() {
	return SPARROW_SOURCE_KEY !== "";
}

export async function sendEvent(payload: EventPayload) {
	if (!SPARROW_SOURCE_KEY) {
		return;
	}

	await fetch(`${SPARROW_URL}/api/v1/event`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Sparrow-Source-Key": SPARROW_SOURCE_KEY,
		},
		keepalive: true,
		body: JSON.stringify(payload),
	});
}
