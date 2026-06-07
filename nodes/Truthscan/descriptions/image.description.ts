import type { INodeProperties } from 'n8n-workflow';

export const imageOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['image'],
		},
	},
	options: [
		{
			name: 'Detect',
			value: 'detect',
			action: 'Detect image',
			description:
				'Upload an image and wait for the scored AI-detection result. Supports JPG, PNG, WebP, HEIC, HEIF, AVIF, BMP, TIFF, GIF, SVG, and PDF (max 10 MB).',
		},
	],
	default: 'detect',
};

export const imageFields: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		placeholder: 'data',
		hint: 'The name of the input binary field containing the image to analyze',
		description:
			'Name of the binary property on the incoming item that holds the image file',
		displayOptions: {
			show: {
				resource: ['image'],
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
			'Whether to run a deep AI analysis (agreement, confidence, key indicators, reasoning, recommendations). Adds processing time.',
		displayOptions: {
			show: {
				resource: ['image'],
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
				resource: ['image'],
				operation: ['detect'],
			},
		},
		options: [
			{
				displayName: 'Generate Heatmap',
				name: 'generateHeatmap',
				type: 'boolean',
				default: true,
				description:
					'Whether to generate a heatmap highlighting AI-generated regions. Only produced for AI-classified images.',
			},
			{
				displayName: 'Generate Preview',
				name: 'generatePreview',
				type: 'boolean',
				default: true,
				description: 'Whether to generate a preview image URL for the uploaded file',
			},
			{
				displayName: 'Heatmap Normalized',
				name: 'heatmapNormalized',
				type: 'boolean',
				default: true,
				description:
					'Whether to normalize the heatmap activation map. Only applies when Generate Heatmap is enabled.',
				displayOptions: {
					show: {
						generateHeatmap: [true],
					},
				},
			},
			{
				displayName: 'Heatmap Overlayed',
				name: 'heatmapOverlayed',
				type: 'boolean',
				default: true,
				description:
					'Whether to blend the heatmap onto the original image. When disabled, a transparent RGBA heatmap is returned. Only applies when Generate Heatmap is enabled.',
				displayOptions: {
					show: {
						generateHeatmap: [true],
					},
				},
			},
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
				default: 'generic',
				description: 'Model or routing hint (e.g. "generic" or "instance_id/model")',
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
				displayName: 'Presigned URL Expiration (Seconds)',
				name: 'expiration',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 3600,
				description: 'Lifetime of the presigned upload URL in seconds',
			},
			{
				displayName: 'Wait for Analysis',
				name: 'waitForAnalysis',
				type: 'boolean',
				default: false,
				description:
					'Whether to keep polling until the deep analysis finishes. Only relevant when Generate Analysis Details is enabled.',
			},
			{
				displayName: 'Wait for Heatmap',
				name: 'waitForHeatmap',
				type: 'boolean',
				default: false,
				description:
					'Whether to keep polling until the heatmap finishes generating. Only relevant when Generate Heatmap is enabled and the image is AI-classified.',
			},
		],
	},
];
