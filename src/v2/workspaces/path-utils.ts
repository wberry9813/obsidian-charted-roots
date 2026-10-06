import { normalizePath } from 'obsidian';

export function normalizeWorkspacePath(path: string): string {
	const normalized = normalizePath(path.trim())
		.replace(/^\/+/, '')
		.replace(/\/+$/, '');
	return normalized;
}

export function isSafeRelativeWorkspacePath(path: string): boolean {
	const trimmed = path.trim();
	if (!trimmed) return false;
	if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return false;

	const segments = trimmed.replace(/\\/g, '/').split('/');
	return !segments.some(segment => segment === '..' || segment === '.');
}

export function pathIsInsideRoot(path: string, root: string): boolean {
	const normalizedPath = normalizeWorkspacePath(path);
	const normalizedRoot = normalizeWorkspacePath(root);
	if (!normalizedPath || !normalizedRoot) return false;
	return normalizedPath === normalizedRoot
		|| normalizedPath.startsWith(`${normalizedRoot}/`);
}

export function rootsOverlap(a: string, b: string): boolean {
	const left = normalizeWorkspacePath(a);
	const right = normalizeWorkspacePath(b);
	if (!left || !right) return false;
	return pathIsInsideRoot(left, right) || pathIsInsideRoot(right, left);
}
