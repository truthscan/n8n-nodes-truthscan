import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { classifyResult } from './classification';
import { imageFields, imageOperations } from './descriptions/image.description';
import { resourceProperty, textFields, textOperations } from './descriptions/text.description';
import { detectText, pollUntilDone } from './transport';
import {
	buildDetectUrl,
	detectImage,
	getPresignedUrl,
	pollImageUntilDone,
	resolveContentType,
	sanitizeFileName,
	uploadToPresignedUrl,
} from './transport/image';

export class Truthscan implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Truthscan',
		name: 'truthscan',
		icon: 'file:truthscan.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Detect AI-generated content with Truthscan',
		defaults: {
			name: 'Truthscan',
		},
		inputs: [NodeConnectionTypes.Main],
		// Three outputs: AI-classified, Real-classified, and a Raw Output catch-all
		// that always emits the unmodified API response for every processed item.
		outputs: [NodeConnectionTypes.Main, NodeConnectionTypes.Main, NodeConnectionTypes.Main],
		outputNames: ['AI', 'Real', 'Raw Output'],
		usableAsTool: true,
		credentials: [
			{
				name: 'truthscanApi',
				required: true,
			},
		],
		properties: [
			resourceProperty,
			textOperations,
			...textFields,
			imageOperations,
			...imageFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const aiItems: INodeExecutionData[] = [];
		const realItems: INodeExecutionData[] = [];
		const rawItems: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('truthscanApi');
		const apiKey = credentials.apiKey as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				let result: IDataObject;

				if (resource === 'text' && operation === 'detect') {
					result = await detectTextOperation.call(this, i, apiKey);
				} else if (resource === 'image' && operation === 'detect') {
					result = await detectImageOperation.call(this, i, apiKey);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" on resource "${resource}" is not supported`,
						{ itemIndex: i },
					);
				}

				// Raw Output always receives the unmodified API response.
				rawItems.push({ json: result, pairedItem: { item: i } });

				// AI / Real receive the response enriched with a classification summary.
				const classification = classifyResult(resource, result);
				const enriched: INodeExecutionData = {
					json: { ...result, classification },
					pairedItem: { item: i },
				};
				(classification.isAI ? aiItems : realItems).push(enriched);
			} catch (error) {
				if (this.continueOnFail()) {
					// Errors flow through the Raw Output catch-all so they are not lost.
					rawItems.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [aiItems, realItems, rawItems];
	}
}

/** Text detect: submit text to /detect, then poll /query until scored. */
async function detectTextOperation(
	this: IExecuteFunctions,
	i: number,
	apiKey: string,
): Promise<IDataObject> {
	const text = this.getNodeParameter('text', i) as string;
	const generateAnalysisDetails = this.getNodeParameter('generateAnalysisDetails', i) as boolean;
	const options = this.getNodeParameter('options', i, {}) as IDataObject;

	const submitted = await detectText.call(this, {
		text,
		apiKey,
		model: (options.model as string) ?? 'xlm_ud_detector',
		retryCount: (options.retryCount as number) ?? 0,
		generateAnalysisDetails,
	});

	const documentId = submitted.id as string | undefined;
	if (!documentId) {
		throw new NodeOperationError(
			this.getNode(),
			'Truthscan did not return a document id for the submitted text',
			{ itemIndex: i },
		);
	}

	return pollUntilDone.call(this, documentId, {
		pollIntervalMs: (options.pollIntervalMs as number) ?? 2000,
		maxPollAttempts: (options.maxPollAttempts as number) ?? 30,
		// Generating analysis implies waiting for it, so the result includes the details.
		waitForAnalysis: generateAnalysisDetails,
	});
}

/** Image detect: presign upload URL, PUT the bytes, submit to /detect, then poll /query. */
async function detectImageOperation(
	this: IExecuteFunctions,
	i: number,
	apiKey: string,
): Promise<IDataObject> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
	const generateAnalysisDetails = this.getNodeParameter('generateAnalysisDetails', i) as boolean;
	const options = this.getNodeParameter('options', i, {}) as IDataObject;

	const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
	const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

	const fileName = sanitizeFileName(binaryData.fileName ?? `image-${i}`);
	const contentType = resolveContentType(fileName, binaryData.mimeType);

	const presigned = await getPresignedUrl.call(this, {
		apiKey,
		fileName,
		expiration: options.expiration as number | undefined,
	});

	const presignedUrl = presigned.presigned_url as string | undefined;
	if (!presignedUrl) {
		throw new NodeOperationError(
			this.getNode(),
			'Truthscan did not return a presigned upload URL',
			{ itemIndex: i },
		);
	}

	await uploadToPresignedUrl.call(this, presignedUrl, buffer, contentType);

	// The detect URL is the public storage URL built from file_path, NOT the upload
	// proxy `presigned_url`. Fail clearly if we have nothing to build it from.
	const detectUrl = buildDetectUrl(presigned, options.storageBaseUrl as string | undefined);
	if (!presigned.file_path && !/^https?:\/\/.+\/.+/i.test(detectUrl)) {
		throw new NodeOperationError(
			this.getNode(),
			'Truthscan did not return a file_path for the uploaded image, so the detection URL could not be built',
			{ itemIndex: i },
		);
	}

	const generateHeatmap = (options.generateHeatmap as boolean) ?? true;

	const submitted = await detectImage.call(this, {
		apiKey,
		url: detectUrl,
		generatePreview: (options.generatePreview as boolean) ?? true,
		generateAnalysisDetails,
		generateHeatmap,
		heatmapOverlayed: generateHeatmap ? ((options.heatmapOverlayed as boolean) ?? true) : undefined,
		heatmapNormalized: generateHeatmap
			? ((options.heatmapNormalized as boolean) ?? true)
			: undefined,
		model: (options.model as string) ?? 'generic',
	});

	const documentId = submitted.id as string | undefined;
	if (!documentId) {
		throw new NodeOperationError(
			this.getNode(),
			'Truthscan did not return a document id for the submitted image',
			{ itemIndex: i },
		);
	}

	return pollImageUntilDone.call(this, documentId, {
		pollIntervalMs: (options.pollIntervalMs as number) ?? 2000,
		maxPollAttempts: (options.maxPollAttempts as number) ?? 30,
		// Generating analysis implies waiting for it, so the result includes the details.
		waitForAnalysis: generateAnalysisDetails,
		waitForHeatmap: (options.waitForHeatmap as boolean) ?? false,
	});
}
