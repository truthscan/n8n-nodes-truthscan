import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { resourceProperty, textFields, textOperations } from './descriptions/text.description';
import { detectText, pollUntilDone } from './transport';

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
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'truthscanApi',
				required: true,
			},
		],
		properties: [resourceProperty, textOperations, ...textFields],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('truthscanApi');
		const apiKey = credentials.apiKey as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource !== 'text' || operation !== 'detect') {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" on resource "${resource}" is not supported`,
						{ itemIndex: i },
					);
				}

				const text = this.getNodeParameter('text', i) as string;
				const generateAnalysisDetails = this.getNodeParameter(
					'generateAnalysisDetails',
					i,
				) as boolean;
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

				const result = await pollUntilDone.call(this, documentId, {
					pollIntervalMs: (options.pollIntervalMs as number) ?? 2000,
					maxPollAttempts: (options.maxPollAttempts as number) ?? 30,
					waitForAnalysis: (options.waitForAnalysis as boolean) ?? false,
				});

				returnData.push({
					json: result,
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
