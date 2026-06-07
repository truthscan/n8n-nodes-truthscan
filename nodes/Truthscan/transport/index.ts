import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

export const TRUTHSCAN_BASE_URL = 'https://detect-text.truthscan.com';

/**
 * Low-level request helper. Uses the built-in httpRequest helper only, so the
 * package ships with zero runtime dependencies (a verification requirement).
 */
async function truthscanRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject,
): Promise<IDataObject> {
	try {
		const response = (await this.helpers.httpRequest({
			method,
			url: `${TRUTHSCAN_BASE_URL}${endpoint}`,
			headers: { 'Content-Type': 'application/json', accept: 'application/json' },
			body,
			json: true,
		})) as IDataObject;

		return response;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export interface DetectTextParams {
	text: string;
	apiKey: string;
	model: string;
	retryCount: number;
	generateAnalysisDetails: boolean;
}

/** Submit text for AI detection. Returns the enqueued document (status: pending). */
export async function detectText(
	this: IExecuteFunctions,
	params: DetectTextParams,
): Promise<IDataObject> {
	return truthscanRequest.call(this, 'POST', '/detect', {
		text: params.text,
		key: params.apiKey,
		model: params.model,
		retry_count: params.retryCount,
		generate_analysis_details: params.generateAnalysisDetails,
	});
}

/** Query the status/result of a previously submitted document. */
export async function queryDocument(
	this: IExecuteFunctions,
	id: string,
): Promise<IDataObject> {
	return truthscanRequest.call(this, 'POST', '/query', { id });
}

export interface PollOptions {
	pollIntervalMs: number;
	maxPollAttempts: number;
	waitForAnalysis: boolean;
}

function analysisSettled(result: IDataObject): boolean {
	const details = result.result_details as IDataObject | null | undefined;
	const status = details?.analysis_results_status;
	// "ready", "skipped", null or absent all mean we no longer need to wait.
	return status !== 'pending';
}

/**
 * Poll /query for a document id until it reaches a terminal state, then return
 * the final response. Throws on a failed job or when attempts are exhausted.
 */
export async function pollUntilDone(
	this: IExecuteFunctions,
	id: string,
	options: PollOptions,
): Promise<IDataObject> {
	let last: IDataObject = {};
	// The most recent response whose core detection is finished, used as a fallback
	// when only the asynchronous analysis fails to settle within the attempt budget.
	let lastDone: IDataObject | undefined;

	for (let attempt = 0; attempt < options.maxPollAttempts; attempt++) {
		last = await queryDocument.call(this, id);
		const status = last.status as string | undefined;

		if (status === 'failed' || status === 'error') {
			throw new NodeApiError(this.getNode(), last as JsonObject, {
				message: `Truthscan detection failed for document ${id}`,
				description: `Document status: ${status}`,
			});
		}

		if (status === 'done') {
			lastDone = last;
			if (!options.waitForAnalysis || analysisSettled(last)) {
				return last;
			}
		}

		await sleep(options.pollIntervalMs);
	}

	// Core detection finished but the analysis kept us polling past the budget; return
	// the completed result rather than discarding it, so the score is never lost.
	if (lastDone) {
		return lastDone;
	}

	throw new NodeApiError(this.getNode(), last as JsonObject, {
		message: 'Timed out waiting for Truthscan detection result',
		description: `Document ${id} did not finish after ${options.maxPollAttempts} polling attempts. Increase "Max Poll Attempts" or "Poll Interval" in the node options.`,
	});
}
