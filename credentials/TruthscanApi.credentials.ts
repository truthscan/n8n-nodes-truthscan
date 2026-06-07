import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class TruthscanApi implements ICredentialType {
	name = 'truthscanApi';

	displayName = 'Truthscan API';

	icon: Icon = 'file:truthscan.svg';

	documentationUrl = 'https://truthscan.com/truthscan-ai-text-detection-api-documentation';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Truthscan API key. Find it in the Truthscan developer portal at https://truthscan.com.',
		},
	];

	// The detect/query endpoints expect the key inside the JSON body, so the node
	// injects it there at runtime. This generic authenticate block only adds the
	// `apikey` header, which the credit-check endpoint used for testing relies on.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				apikey: '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://detect-text.truthscan.com',
			url: '/check-user-credits',
			method: 'GET',
		},
	};
}
