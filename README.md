# n8n-nodes-truthscan

This is an n8n community node. It lets you use [Truthscan](https://truthscan.com) AI detection in your n8n workflows.

Truthscan detects AI-generated content. This package currently ships **AI text detection** and **AI image detection**, with video and audio detection planned for future releases.

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

### Image

- **Detect** - Submit an image for AI detection. Connect a node that outputs binary data (e.g. **HTTP Request**, **Read/Write Files from Disk**, or **Google Drive**) and point the **Input Binary Field** at it. The node runs the full 3-step Truthscan flow automatically — it requests a presigned upload URL, uploads the image to storage, submits it to `/detect`, and polls `/query` until the score is ready. Supported formats: JPG, JPEG, PNG, WebP, JFIF, HEIC, HEIF, AVIF, BMP, TIFF, TIF, GIF, SVG, and PDF (PDF analyzes the first image only). File size: 1 KB–10 MB.

> Video and Audio detection operations are planned for future versions.

## Credentials

You need a Truthscan API key.

1. Sign up at [truthscan.com](https://truthscan.com).
2. Open the developer portal and copy your API key.
3. In n8n, create a new **Truthscan API** credential and paste the key.

The credential is validated against Truthscan's `check-user-credits` endpoint when you save it.

## Usage

Add the **Truthscan** node, choose a resource and the **Detect** operation. For **Text**, provide the text to analyze. For **Image**, set the **Input Binary Field** to the name of the binary property holding your image (usually `data`).

### Text options

- **Generate Analysis Details** - run a deep AI analysis (agreement, confidence, key indicators, reasoning, linguistic patterns, recommendations). When enabled, the node automatically keeps polling until the analysis finishes, so the result includes `analysis_results`.
- **Model** - detection model to use (default `xlm_ud_detector`).
- **Retry Count** - number of retries if processing fails.
- **Poll Interval (Ms)** - how long to wait between status checks (default 2000 ms).
- **Max Poll Attempts** - maximum number of status checks before giving up (default 30). If the core score is ready but the analysis is still processing when this budget runs out, the node returns the completed score rather than erroring.

### Image options

- **Generate Analysis Details** - run a deep AI analysis (image tags, agreement, confidence, key indicators, reasoning, visual patterns, recommendations). When enabled, the node automatically keeps polling until the analysis finishes, so the result includes `analysis_results`.
- **Generate Preview** - generate a preview image URL (default on).
- **Generate Heatmap** - generate a heatmap of AI-generated regions, only produced for AI-classified images (default on).
- **Heatmap Overlayed** - blend the heatmap onto the original image; when off, returns a transparent RGBA heatmap (only when Generate Heatmap is on).
- **Heatmap Normalized** - normalize the heatmap activation map (only when Generate Heatmap is on).
- **Model** - model or routing hint (default `generic`).
- **Presigned URL Expiration (Seconds)** - lifetime of the upload URL (default 3600).
- **Storage Base URL** - override the storage host used to build the detection URL (leave empty for the default production bucket).
- **Poll Interval (Ms)** / **Max Poll Attempts** - polling cadence and budget (defaults 2000 ms / 30). If the core score is ready but the heatmap/analysis is still processing when the budget runs out, the node returns the completed score rather than erroring.
- **Wait for Heatmap** - keep polling until the heatmap finishes generating (only relevant when Generate Heatmap is on and the image is AI-classified).

### Outputs

The node has **three outputs** so you can branch your workflow on the verdict without an extra IF/Switch node:

| Output | Receives |
| --- | --- |
| **AI** | Items classified as AI-generated (score ≥ 50, or a non-`Human` text label), enriched with a `classification` object. |
| **Real** | Items classified as authentic/human (score < 50, or the `Human` text label), enriched with a `classification` object. |
| **Raw Output** | **Every** processed item with the unmodified Truthscan response. When *Continue On Fail* is on, error items are emitted here too. |

The `classification` object added to the **AI** and **Real** outputs looks like:

```json
{
  "classification": "AI",
  "isAI": true,
  "score": 90.24,
  "label": "Synthetic (AI)",
  "tier": "SYNTHETIC"
}
```

**Image score tiers** (`tier`/`label`), based on the 0–100 `result` score:

| Score | Tier | Label | Routed to |
| --- | --- | --- | --- |
| 0–20 | `REAL` | Real | Real |
| 20–50 | `LIKELY_REAL` | Likely Real | Real |
| 50–80 | `LIKELY_SYNTHETIC` | Likely Synthetic (AI) | AI |
| 80–100 | `SYNTHETIC` | Synthetic (AI) | AI |

For **text**, the API `label` (`Human` / `AI` / `Paraphrase`) drives routing: `Human` → **Real**, everything else → **AI** (falling back to the score when no label is present). `tier` is omitted for text.

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

For an **image** detection, the response includes `result` (0–100 score), `result_details.final_result` (e.g. `AI Generated`, `Real`, `Digitally Edited`), `result_details.confidence`, and — when requested and applicable — `result_details.heatmap_url`, `result_details.analysis_results`, and `preview_url`.

```json
{
  "id": "00fee5ff-a55b-42fb-b7c7-d14f05ae0769",
  "status": "done",
  "result": 90.24,
  "result_details": {
    "is_valid": true,
    "detection_step": 3,
    "final_result": "AI Generated",
    "confidence": 90.24,
    "heatmap_status": "ready",
    "heatmap_url": "https://.../uploads/...",
    "analysis_results_status": "ready",
    "analysis_results": null
  },
  "preview_url": "https://.../previews/..."
}
```

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Truthscan AI Text Detection API documentation](https://truthscan.com/truthscan-ai-text-detection-api-documentation)
- [Truthscan AI Image Detection API documentation](https://truthscan.com/truthscan-ai-image-detection-api-documentation)

## License

[MIT](LICENSE.md)
