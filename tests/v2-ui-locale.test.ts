import { describe, expect, it } from 'vitest';
import {
	resolveUiLanguage,
	translateUiText
} from '../src/i18n/ui-locale';

describe('UI locale', () => {
	it('uses explicit plugin language preferences', () => {
		expect(resolveUiLanguage('zh-CN', 'en-US')).toBe('zh-CN');
		expect(resolveUiLanguage('en', 'zh-CN')).toBe('en');
	});

	it('auto-detects Simplified Chinese families', () => {
		expect(resolveUiLanguage('auto', 'zh-CN')).toBe('zh-CN');
		expect(resolveUiLanguage('auto', 'zh-Hans')).toBe('zh-CN');
		expect(resolveUiLanguage('auto', 'en-US')).toBe('en');
	});

	it('translates stable settings and workspace strings without touching keys', () => {
		expect(translateUiText('Search settings', 'zh-CN')).toBe('搜索设置');
		expect(translateUiText('Historical research', 'zh-CN')).toBe('历史研究');
		expect(translateUiText('cr_type', 'zh-CN')).toBe('cr_type');
		expect(
			translateUiText('Active Workspace: 中国历史', 'zh-CN')
		).toBe('当前工作区：中国历史');
	});
});
