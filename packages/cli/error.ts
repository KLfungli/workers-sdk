export class CancelError extends Error {
	constructor(
		message?: string,
		readonly signal?: NodeJS.Signals
	) {
		super(message);
	}
}
