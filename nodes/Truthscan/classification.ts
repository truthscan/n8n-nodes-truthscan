import type { IDataObject } from 'n8n-workflow';

/**
 * Image score tiers (0-100). Mirrors the upstream Truthscan `SCORE_RANGES`:
 * 0-20 Real, 20-50 Likely Real, 50-80 Likely Synthetic (AI), 80-100 Synthetic (AI).
 * `min` is inclusive, `max` exclusive (except the top tier, which includes 100).
 */
export const IMAGE_SCORE_RANGES = {
	REAL: { min: 0, max: 20, label: 'Real' },
	LIKELY_REAL: { min: 20, max: 50, label: 'Likely Real' },
	LIKELY_SYNTHETIC: { min: 50, max: 80, label: 'Likely Synthetic (AI)' },
	SYNTHETIC: { min: 80, max: 100, label: 'Synthetic (AI)' },
} as const;

export type ImageTier = keyof typeof IMAGE_SCORE_RANGES;

/** Score at and above which a result is routed to the "AI" output. */
const AI_THRESHOLD = IMAGE_SCORE_RANGES.LIKELY_SYNTHETIC.min; // 50

export interface Classification {
	/** Coarse routing bucket used to pick the node output. */
	classification: 'AI' | 'Real';
	isAI: boolean;
	/** 0-100 score when available, otherwise null. */
	score: number | null;
	/** Human-friendly label (4-tier for images, API label for text). */
	label: string;
	/** Fine-grained image tier; omitted for text. */
	tier?: ImageTier;
}

/** Map a 0-100 image score to its 4-tier classification. */
export function classifyImageScore(score: number): Classification {
	let tier: ImageTier;
	if (score >= IMAGE_SCORE_RANGES.SYNTHETIC.min) {
		tier = 'SYNTHETIC';
	} else if (score >= IMAGE_SCORE_RANGES.LIKELY_SYNTHETIC.min) {
		tier = 'LIKELY_SYNTHETIC';
	} else if (score >= IMAGE_SCORE_RANGES.LIKELY_REAL.min) {
		tier = 'LIKELY_REAL';
	} else {
		tier = 'REAL';
	}

	const isAI = score >= AI_THRESHOLD;
	return {
		classification: isAI ? 'AI' : 'Real',
		isAI,
		score,
		label: IMAGE_SCORE_RANGES[tier].label,
		tier,
	};
}

function getNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Classify a text /query result. Prefers the API `label`, falling back to the score. */
function classifyText(result: IDataObject): Classification {
	const score = getNumber(result.result);
	const apiLabel = typeof result.label === 'string' ? (result.label as string) : undefined;

	// "Human" => Real; "AI" and "Paraphrase" => AI. Without a label, fall back to the score.
	const isAI = apiLabel
		? apiLabel.toLowerCase() !== 'human'
		: score !== null && score >= AI_THRESHOLD;

	return {
		classification: isAI ? 'AI' : 'Real',
		isAI,
		score,
		label: apiLabel ?? (isAI ? 'AI' : 'Human'),
	};
}

/** Classify an image /query result, using the score when present. */
function classifyImage(result: IDataObject): Classification {
	const score = getNumber(result.result);
	if (score !== null) {
		return classifyImageScore(score);
	}

	// No numeric score (rare): fall back to the textual final_result, if any.
	const details = result.result_details as IDataObject | undefined;
	const finalResult = typeof details?.final_result === 'string' ? details.final_result : '';
	const isAI = /\bai\b|synthetic|generated|edited/i.test(finalResult);
	return {
		classification: isAI ? 'AI' : 'Real',
		isAI,
		score: null,
		label: finalResult || (isAI ? 'AI' : 'Real'),
	};
}

/** Route a detection result to a coarse AI/Real bucket plus a descriptive label. */
export function classifyResult(resource: string, result: IDataObject): Classification {
	return resource === 'image' ? classifyImage(result) : classifyText(result);
}
