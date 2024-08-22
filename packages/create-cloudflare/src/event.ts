import type { C3Args } from "./types";
import type { PromptConfig } from "@cloudflare/cli/interactive";

export type Event =
	| {
			name: "c3 session started";
			properties: {
				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;
			};
	  }
	| {
			name: "c3 session cancelled";
			properties: {
				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * The duration of the prompt since it started
				 */
				durationMs?: number;
			};
	  }
	| {
			name: "c3 session errored";
			properties: {
				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * The error that caused the session to be crashed
				 */
				error?: {
					message: string | undefined;
					stack: string | undefined;
				};

				/**
				 * The duration of the prompt since it started
				 */
				durationMs?: number;
			};
	  }
	| {
			name: "c3 session completed";
			properties: {
				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * The duration of the prompt since it started
				 */
				durationMs?: number;
			};
	  }
	| {
			name: "c3 prompt started";
			properties: {
				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * The argument key related to the prompt
				 */
				key?: string;

				/**
				 * An object containing all config passed to the prompt
				 */
				promptConfig?: PromptConfig;
			};
	  }
	| {
			name: "c3 prompt cancelled";
			properties: {
				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * The argument key related to the prompt
				 */
				key?: string;

				/**
				 * An object containing all config passed to the prompt
				 */
				promptConfig?: PromptConfig;

				/**
				 * The duration of the prompt since it started
				 */
				durationMs?: number;
			};
	  }
	| {
			name: "c3 prompt errored";
			properties: {
				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * The argument key related to the prompt
				 */
				key?: string;

				/**
				 * An object containing all config passed to the prompt
				 */
				promptConfig?: PromptConfig;

				/**
				 * The duration of the prompt since it started
				 */
				durationMs?: number;

				/**
				 * The error that caused the prompt to be crashed
				 */
				error?: {
					message: string | undefined;
					stack: string | undefined;
				};
			};
	  }
	| {
			name: "c3 prompt completed";
			properties: {
				/**
				 * The CLI arguments set at the time the event is sent
				 */
				args?: Partial<C3Args>;

				/**
				 * The argument key related to the prompt
				 */
				key?: string;

				/**
				 * An object containing all config passed to the prompt
				 */
				promptConfig?: PromptConfig;

				/**
				 * The duration of the prompt since it started
				 */
				durationMs?: number;

				/**
				 *  The answer of the prompt. This could either be taken from the args provided or from the user input.
				 */
				answer?: unknown;

				/**
				 *  Whether the answer is the same as the default value of the prompt.
				 */
				isDefaultValue?: boolean;
			};
	  };
