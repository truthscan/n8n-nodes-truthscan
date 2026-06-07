import type { INodeProperties } from 'n8n-workflow';

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{
			name: 'Text',
			value: 'text',
			description: 'Detect AI-generated text',
		},
		// Image, Video and Audio resources are planned and will be added here.
	],
	default: 'text',
};

export const textOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['text'],
		},
	},
	options: [
		{
			name: 'Detect',
			value: 'detect',
			action: 'Detect text',
			description:
				'Submit text for AI detection and wait for the scored result. At least 200 words are recommended for best accuracy.',
		},
	],
	default: 'detect',
};

export const textFields: INodeProperties[] = [
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		required: true,
		default: '',
		description: 'The text to analyze. Must be under 30,000 words; 200+ words recommended for best accuracy.',
		displayOptions: {
			show: {
				resource: ['text'],
				operation: ['detect'],
			},
		},
	},
	{
		displayName: 'Generate Analysis Details',
		name: 'generateAnalysisDetails',
		type: 'boolean',
		default: false,
		description:
			'Whether to run a deep AI analysis (agreement, confidence, key indicators, reasoning). Adds processing time.',
		displayOptions: {
			show: {
				resource: ['text'],
				operation: ['detect'],
			},
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['text'],
				operation: ['detect'],
			},
		},
		options: [
			{
				displayName: 'Max Poll Attempts',
				name: 'maxPollAttempts',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 30,
				description: 'Maximum number of status checks before giving up',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: 'xlm_ud_detector',
				description: 'AI detection model to use',
			},
			{
				displayName: 'Poll Interval (Ms)',
				name: 'pollIntervalMs',
				type: 'number',
				typeOptions: { minValue: 250 },
				default: 2000,
				description: 'How long to wait between status checks while the result is processing',
			},
			{
				displayName: 'Retry Count',
				name: 'retryCount',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Number of retries if processing fails',
			},
			{
				displayName: 'Wait for Analysis',
				name: 'waitForAnalysis',
				type: 'boolean',
				default: false,
				description:
					'Whether to keep polling until the deep analysis finishes. Only relevant when Generate Analysis Details is enabled.',
			},
		],
	},
];
