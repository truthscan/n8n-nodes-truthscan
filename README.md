# n8n-nodes-truthscan

This is an n8n community node. It lets you use [Truthscan](https://truthscan.com) AI detection in your n8n workflows.

Truthscan detects AI-generated content. This package currently ships **AI text detection**, with image, video, and audio detection planned for future releases.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Usage](#usage)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

In short: go to **Settings > Community Nodes**, select **Install**, and enter `n8n-nodes-truthscan`.

## Operations

### Text

- **Detect** - Submit text for AI detection. The node calls Truthscan's `/detect` endpoint, then automatically polls `/query` until the result is ready, returning the final score in a single step. At least 200 words are recommended for best accuracy (maximum 30,000 words).

> Image, Video, and Audio detection operations are planned for future versions.

## Credentials

You need a Truthscan API key.

1. Sign up at [truthscan.com](https://truthscan.com).
2. Open the developer portal and copy your API key.
3. In n8n, create a new **Truthscan API** credential and paste the key.

The credential is validated against Truthscan's `check-user-credits` endpoint when you save it.

## Usage

Add the **Truthscan** node, choose the **Text** resource and the **Detect** operation, and provide the text to analyze.

### Options

- **Generate Analysis Details** - run a deep AI analysis (agreement, confidence, key indicators, reasoning, linguistic patterns, recommendations).
- **Model** - detection model to use (default `xlm_ud_detector`).
- **Retry Count** - number of retries if processing fails.
- **Poll Interval (Ms)** - how long to wait between status checks (default 2000 ms).
- **Max Poll Attempts** - maximum number of status checks before timing out (default 30).
- **Wait for Analysis** - keep polling until the deep analysis finishes (only relevant when Generate Analysis Details is enabled).

### Result interpretation

The node returns the full Truthscan response. Key fields:

- `result` - score from 0-100. Under 50 = human, 50-60 = possible AI, over 60 = AI.
- `label` - `Human`, `AI`, or `Paraphrase`.
- `result_details` - approximate scores from third-party detectors and (when requested) deep `analysis_results`.
- `result_categories` - `advanced` and `standard` tiered scores.

### Example output

```json
{
  "id": "77565038-9e3d-4e6a-8c80-e20785be5ee9",
  "model": "xlm_ud_detector",
  "result": 12.0,
  "label": "Human",
  "status": "done",
  "result_details": {
    "scoreGptZero": 50.0,
    "human": 88.0
  },
  "result_categories": { "advanced": 12, "standard": 12 }
}
```

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Truthscan AI Text Detection API documentation](https://truthscan.com/truthscan-ai-text-detection-api-documentation)

## License

[MIT](LICENSE.md)
