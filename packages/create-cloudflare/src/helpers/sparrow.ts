import { fetch } from "undici";

// The __SPARROW_SOURCE_KEY__ will be replaced with the env value at build time through esbuild's `define` option
const SPARROW_SOURCE_KEY: string = "__SPARROW_SOURCE_KEY__";
const SPARROW_URL: string = "https://sparrow.cloudflare.com";

export type EventPayload = {
	event: string;
	deviceId: string;
	userId: string | undefined;
	timestamp: number | undefined;
	properties: Record<string, unknown>;
};

export function hasSparrowSourceKey() {
	return SPARROW_SOURCE_KEY !== "__SPARROW_SOURCE_KEY__";
}

export async function sendEvent(payload: EventPayload) {
	await fetch(`${SPARROW_URL}/api/v1/event`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Sparrow-Source-Key": SPARROW_SOURCE_KEY,
		},
		body: JSON.stringify(payload),
	});
}
