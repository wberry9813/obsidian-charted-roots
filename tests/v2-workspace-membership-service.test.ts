import { describe, expect, it } from 'vitest';
import { MembershipService } from '../src/organizations/services/membership-service';

describe('MembershipService Workspace scope', () => {
	it('limits person lookup, organization members and stats to the active Workspace', () => {
		let activeWorkspaceId = 'history';
		const files = [
			{ path: 'Workspace-E2E/History/People/History-A.md', basename: 'History-A' },
			{ path: 'Workspace-E2E/Shushan/People/Fiction-A.md', basename: 'Fiction-A' },
			{ path: 'Workspace-E2E/Shushan/People/Fiction-B.md', basename: 'Fiction-B' }
		];
		const frontmatter = new Map<string, Record<string, unknown>>([
			['Workspace-E2E/History/People/History-A.md', {
				cr_type: 'person',
				cr_id: 'history-a',
				name: 'History A',
				membership_orgs: ['[[Shared Org]]'],
				membership_org_ids: ['shared-org'],
				membership_roles: ['Historian']
			}],
			['Workspace-E2E/Shushan/People/Fiction-A.md', {
				cr_type: 'person',
				cr_id: 'fiction-a',
				name: 'Fiction A',
				membership_orgs: ['[[Shared Org]]'],
				membership_org_ids: ['shared-org'],
				membership_roles: ['Disciple']
			}],
			['Workspace-E2E/Shushan/People/Fiction-B.md', {
				cr_type: 'person',
				cr_id: 'fiction-b',
				name: 'Fiction B',
				membership_orgs: ['[[Shared Org]]'],
				membership_org_ids: ['shared-org'],
				membership_roles: ['Elder']
			}]
		]);

		const filesForActiveWorkspace = () => files.filter(file =>
			activeWorkspaceId === 'history'
				? file.path.startsWith('Workspace-E2E/History/')
				: file.path.startsWith('Workspace-E2E/Shushan/')
		);

		const plugin = {
			settings: { noteTypeDetection: undefined },
			app: {
				vault: { getMarkdownFiles: () => files },
				metadataCache: {
					getFileCache: (file: { path: string }) => ({
						frontmatter: frontmatter.get(file.path)
					})
				}
			},
			getWorkspaceService: () => ({
				getScope: () => ({ getMarkdownFiles: filesForActiveWorkspace })
			})
		} as never;
		const organizationService = {
			getOrganization: () => null
		} as never;
		const service = new MembershipService(plugin, organizationService);

		expect(service.getOrganizationMembers('shared-org').map(member => member.personCrId))
			.toEqual(['history-a']);
		expect(service.getMembershipStats()).toEqual({
			peopleWithMemberships: 1,
			totalMemberships: 1
		});
		expect(service.getPersonMemberships('history-a')).toHaveLength(1);
		expect(service.getPersonMemberships('fiction-a')).toEqual([]);

		activeWorkspaceId = 'shushan';

		expect(service.getOrganizationMembers('shared-org').map(member => member.personCrId).sort())
			.toEqual(['fiction-a', 'fiction-b']);
		expect(service.getMembershipStats()).toEqual({
			peopleWithMemberships: 2,
			totalMemberships: 2
		});
		expect(service.getPersonMemberships('history-a')).toEqual([]);
		expect(service.getPersonMemberships('fiction-a')).toHaveLength(1);
	});
});
