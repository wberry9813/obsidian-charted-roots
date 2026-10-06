export interface StrippedApproximation {
	expression: string;
	approximate: boolean;
}

export function stripApproximationPrefix(
	input: string
): StrippedApproximation {
	let expression = input.trim();
	let approximate = false;

	const patterns = [
		/^约\s*/u,
		/^約\s*/u,
		/^大约\s*/u,
		/^大約\s*/u,
		/^circa\s+/iu,
		/^ca\.?\s+/iu,
		/^c\.\s*/iu,
		/^~\s*/
	];

	for (const pattern of patterns) {
		if (pattern.test(expression)) {
			expression = expression.replace(pattern, '').trim();
			approximate = true;
			break;
		}
	}

	return { expression, approximate };
}
