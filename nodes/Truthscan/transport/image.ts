import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

export const TRUTHSCAN_IMAGE_BASE_URL = 'https://detect-image.truthscan.com';

/** Maps a lowercase file extension to the exact Content-Type the storage PUT expects. */
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	jfif: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	heic: 'image/heic',
	heif: 'image/heif',
	avif: 'image/avif',
	bmp: 'image/bmp',
	tiff: 'image/tiff',
	tif: 'image/tiff',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	pdf: 'application/pdf',
};

/**
 * The presigned-URL endpoint rejects spaces and unsafe characters, so we strip
 * them before requesting the URL (the server may normalize further).
 */
export function sanitizeFileName(fileName: string): string {
	const cleaned = fileName
		.trim()
		.replace(/\s+/g, '_')
		.replace(/[^A-Za-z0-9._-]/g, '');
	return cleaned.length > 0 ? cleaned : 'upload';
}

/**
 * Resolve the Content-Type for the storage PUT. The file extension is the source
 * of truth (the docs require an exact match); the binary mime type is a fallback,
 * with the common `image/jpg` mistake corrected to `image/jpeg`.
 */
export function resolveContentType(fileName: string, binaryMimeType?: string): string {
	const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
	if (ext && EXTENSION_CONTENT_TYPES[ext]) {
		return EXTENSION_CONTENT_TYPES[ext];
	}
	if (binaryMimeType) {
		return binaryMimeType === 'image/jpg' ? 'image/jpeg' : binaryMimeType;
	}
	return 'application/octet-stream';
}

/**
 * Build the public object URL that `/detect` fetches, derived from the presigned
 * URL we just uploaded to. We use the presigned URL's exact object key (minus the
 * query string) so `/detect` always points at the bytes we actually stored, and we
 * convert path-style (`host/bucket/key`) to virtual-hosted style (`bucket.host/key`).
 */
export function buildObjectUrl(presignedUrl: string): string {
	const url = new URL(presignedUrl);
	const segments = url.pathname.replace(/^\/+/, '').split('/');
	const bucket = segments.shift() ?? '';
	const key = segments.join('/');

	if (!bucket || url.host.startsWith(`${bucket}.`)) {
		return `${url.protocol}//${url.host}/${url.pathname.replace(/^\/+/, '')}`;
	}
	return `${url.protocol}//${bucket}.${url.host}/${key}`;
}

async function imageJsonRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	options: { body?: IDataObject; qs?: IDataObject; headers?: IDataObject },
): Promise<IDataObject> {
	try {
		return (await this.helpers.httpRequest({
			method,
			url: `${TRUTHSCAN_IMAGE_BASE_URL}${endpoint}`,
			headers: { accept: 'application/json', ...(options.headers ?? {}) },
			body: options.body,
			qs: options.qs,
			json: true,
		})) as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export interface PresignedUrlParams {
	apiKey: string;
	fileName: string;
	expiration?: number;
}

/** Step 1: request a presigned upload URL. Returns presigned_url, file_path, document_id. */
export async function getPresignedUrl(
	this: IExecuteFunctions,
	params: PresignedUrlParams,
): Promise<IDataObject> {
	const qs: IDataObject = { file_name: params.fileName };
	if (params.expiration) {
		qs.expiration = params.expiration;
	}
	return imageJsonRequest.call(this, 'GET', '/get-presigned-url', {
		qs,
		headers: { apikey: params.apiKey },
	});
}

/**
 * Step 2: upload the raw image bytes to the presigned URL via PUT. This is a direct
 * call to object storage (not the Truthscan API); a 2xx with an empty body is success.
 */
export async function uploadToPresignedUrl(
	this: IExecuteFunctions,
	presignedUrl: string,
	buffer: Buffer,
	contentType: string,
): Promise<void> {
	try {
		await this.helpers.httpRequest({
			method: 'PUT',
			url: presignedUrl,
			body: buffer,
			headers: { 'Content-Type': contentType, 'x-amz-acl': 'private' },
			json: false,
			returnFullResponse: true,
		});
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			message: 'Failed to upload the image to Truthscan storage',
		});
	}
}

export interface DetectImageParams {
	apiKey: string;
	url: string;
	generatePreview: boolean;
	generateAnalysisDetails: boolean;
	generateHeatmap: boolean;
	heatmapOverlayed?: boolean;
	heatmapNormalized?: boolean;
	model: string;
}

/** Step 3: submit the uploaded image for detection. Returns the enqueued document (status: pending). */
export async function detectImage(
	this: IExecuteFunctions,
	params: DetectImageParams,
): Promise<IDataObject> {
	const body: IDataObject = {
		key: params.apiKey,
		url: params.url,
		generate_preview: params.generatePreview,
		generate_analysis_details: params.generateAnalysisDetails,
		generate_heatmap: params.generateHeatmap,
		model: params.model,
	};

	// The API returns 422 if these are sent as true while heatmaps are disabled,
	// so they are only included when heatmap generation is on.
	if (params.generateHeatmap) {
		if (params.heatmapOverlayed !== undefined) {
			body.generate_heatmap_overlayed = params.heatmapOverlayed;
		}
		if (params.heatmapNormalized !== undefined) {
			body.generate_heatmap_normalized = params.heatmapNormalized;
		}
	}

	return imageJsonRequest.call(this, 'POST', '/detect', { body });
}

/** Query the status/result of a previously submitted image document (no API key required). */
export async function queryImageDocument(
	this: IExecuteFunctions,
	id: string,
): Promise<IDataObject> {
	return imageJsonRequest.call(this, 'POST', '/query', { body: { id } });
}

export interface ImagePollOptions {
	pollIntervalMs: number;
	maxPollAttempts: number;
	waitForAnalysis: boolean;
	waitForHeatmap: boolean;
}

/** "pending" is the only non-terminal heatmap state; ready/failed/absent are settled. */
function heatmapSettled(result: IDataObject): boolean {
	const details = result.result_details as IDataObject | null | undefined;
	return details?.heatmap_status !== 'pending';
}

/** "pending"/"analyzing" mean analysis is still running; everything else is settled. */
function analysisSettled(result: IDataObject): boolean {
	const details = result.result_details as IDataObject | null | undefined;
	const status = details?.analysis_results_status;
	return status !== 'pending' && status !== 'analyzing';
}

/**
 * Poll /query for an image document until it reaches a terminal state, then return
 * the final response. Optionally keeps polling until the asynchronous heatmap and/or
 * deep analysis have settled. Throws on a failed job or when attempts are exhausted.
 */
export async function pollImageUntilDone(
	this: IExecuteFunctions,
	id: string,
	options: ImagePollOptions,
): Promise<IDataObject> {
	let last: IDataObject = {};

	for (let attempt = 0; attempt < options.maxPollAttempts; attempt++) {
		last = await queryImageDocument.call(this, id);
		const status = last.status as string | undefined;

		if (status === 'failed' || status === 'error') {
			throw new NodeApiError(this.getNode(), last as JsonObject, {
				message: `Truthscan image detection failed for document ${id}`,
				description: `Document status: ${status}`,
			});
		}

		if (status === 'done') {
			const heatmapReady = !options.waitForHeatmap || heatmapSettled(last);
			const analysisReady = !options.waitForAnalysis || analysisSettled(last);
			if (heatmapReady && analysisReady) {
				return last;
			}
		}

		await sleep(options.pollIntervalMs);
	}

	throw new NodeApiError(this.getNode(), last as JsonObject, {
		message: 'Timed out waiting for Truthscan image detection result',
		description: `Document ${id} did not finish after ${options.maxPollAttempts} polling attempts. Increase "Max Poll Attempts" or "Poll Interval" in the node options.`,
	});
}
