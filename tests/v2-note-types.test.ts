import { describe, expect, it } from 'vitest';
import {
	detectNoteType,
	isAssertionNote,
	isClaimNote,
	isOfficeNote,
	isPeriodNote,
	isProcessNote
} from '../src/utils/note-type-detection';

describe('v2 note type detection', () => {
	it.each([
		['office', isOfficeNote],
		['process', isProcessNote],
		['period', isPeriodNote],
		['assertion', isAssertionNote],
		['claim', isClaimNote]
	] as const)('recognizes cr_type: %s', (type, helper) => {
		const frontmatter = { cr_schema: 2, cr_type: type, cr_id: `${type}-1` };

		expect(detectNoteType(frontmatter)).toBe(type);
		expect(helper(frontmatter)).toBe(true);
	});

	it('keeps cr_type authoritative over a foreign legacy type value', () => {
		expect(detectNoteType({
			cr_schema: 2,
			cr_type: 'assertion',
			type: 'character',
			cr_id: 'a1'
		})).toBe('assertion');
	});
});
