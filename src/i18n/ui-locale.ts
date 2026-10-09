export type UiLanguagePreference = 'auto' | 'en' | 'zh-CN';
export type ResolvedUiLanguage = 'en' | 'zh-CN';

const ZH_CN_TEXT: Record<string, string> = {
	'Language': '界面语言',
	'Follow Obsidian / system': '跟随 Obsidian / 系统',
	'English': 'English',
	'Simplified Chinese': '简体中文',
	'Search settings': '搜索设置',
	'Filter settings...': '筛选设置…',

	'Folders': '文件夹',
	'Where Charted Roots stores and finds notes': 'Charted Roots 存放和查找笔记的位置',
	'Manage Workspaces': '管理工作区',
	'Active Workspace': '当前工作区',
	'Views, pickers and new notes use this Workspace by default.': '视图、选择器和新建笔记默认使用此工作区。',
	'No Workspace catalog is configured yet.': '尚未配置工作区目录。',
	'Add Workspace': '添加工作区',
	'Close': '关闭',
	'Active': '当前',
	'Activate': '切换到此工作区',
	'Edit': '编辑',
	'Delete': '删除',
	'Edit Workspace': '编辑工作区',
	'Name': '名称',
	'Display name shown in the Workspace selector.': '显示在工作区选择器中的名称。',
	'Workspace ID': '工作区 ID',
	'Root folder': '根目录',
	'Vault-relative folder that owns this dataset. Workspace roots may not overlap.': '此数据集所属的库内相对目录。不同工作区根目录不能重叠。',
	'Mode': '模式',
	'Default working context for this Workspace.': '此工作区的默认工作模式。',
	'Ontology packs': '本体包',
	'Comma-separated pack IDs. “core” is always enabled.': '用逗号分隔本体包 ID；“core” 始终启用。',
	'Folder overrides (advanced)': '文件夹覆盖（高级）',
	'Leave blank to use the default relative folder. Overrides remain inside the Workspace root.': '留空则使用默认相对目录；覆盖路径仍必须位于工作区根目录内。',
	'Save': '保存',
	'Cancel': '取消',
	'Remove Workspace?': '移除工作区？',
	'Remove Workspace': '移除工作区',
	'Workspace': '工作区',
	'Genealogy': '家谱',
	'Historical research': '历史研究',
	'Worldbuilding': '世界观构建',

	'People': '人物',
	'Places': '地点',
	'Organizations': '组织',
	'Offices': '官职',
	'Events': '事件',
	'Processes': '过程',
	'Periods': '时期',
	'Assertions': '断言',
	'Claims': '主张',
	'Sources': '史料',
	'Citations': '引用',
	'Research': '研究',
	'Maps': '地图',
	'Universes': '世界',
	'Schemas': 'Schema',
	'Canvases': '画布',
	'Staging': '暂存区',
	'Notes': '笔记',
	'Bases': 'Bases',
	'Timelines': '时间线',
	'Reports': '报告',

	'Legacy entity folders': '旧版实体文件夹',
	'Legacy output folders': '旧版输出文件夹',
	'Media folder filtering': '媒体文件夹筛选',
	'Limit media scanning to specified folders': '仅扫描指定媒体文件夹',
	'When enabled, only scan the folders listed below for media files': '启用后，仅扫描下方列出的文件夹中的媒体文件。',
	'System folders': '系统文件夹',

	'Data & detection': '数据与识别',
	'How Charted Roots identifies and syncs notes': 'Charted Roots 如何识别和同步笔记',
	'Auto-generate cr_id': '自动生成 cr_id',
	'Primary type property': '主要类型字段',
	'Which frontmatter property to check first for note type (person, place, event, etc.)': '优先使用哪个 frontmatter 字段判断笔记类型（人物、地点、事件等）。',
	'Enable tag-based detection': '启用标签识别',
	'Allow tags (#person, #place, #event, #source) as fallback when no type property is found': '找不到类型字段时，允许使用 #person、#place、#event、#source 等标签作为回退识别。',
	'Accept DMS coordinate format': '接受度分秒坐标格式',
	'GEDCOM compatibility mode': 'GEDCOM 兼容模式',
	'Enable bidirectional relationship sync': '启用双向关系同步',
	'Automatically maintain reciprocal relationships when editing notes': '编辑笔记时自动维护互为对应的关系。',
	'Sync on file modify': '文件修改时同步',
	'Automatically sync relationships when person notes are edited': '人物笔记被修改时自动同步关系。',

	'Privacy & export': '隐私与导出',
	'Control how data is protected and exported': '控制数据保护与导出方式',
	'Enable privacy protection': '启用隐私保护',
	'Living person age threshold': '在世人物年龄阈值',
	'Privacy display format': '隐私显示方式',
	'Hide details for living persons': '隐藏在世人物详情',
	'Export filename pattern': '导出文件名格式',

	'Canvas & trees': '画布与家谱树',
	'Tree generation layout and styling': '家谱树生成布局与样式',
	'Node dimensions': '节点尺寸',
	'Node width': '节点宽度',
	'Node height': '节点高度',
	'Spacing': '间距',
	'Horizontal spacing': '水平间距',
	'Vertical spacing': '垂直间距',
	'Colors & styling': '颜色与样式',
	'Color scheme': '配色方案',
	'Canvas grouping': '画布分组',
	'Arrow styles': '箭头样式',
	'Parent → child arrows': '父母 → 子女箭头',

	'Dates & validation': '日期与校验',
	'Date format and validation rules': '日期格式与校验规则',
	'Date format standard': '日期格式标准',
	'Allow partial dates': '允许不完整日期',
	'Allow circa dates': '允许约数日期',
	'Allow date ranges': '允许日期范围',
	'Require leading zeros': '要求前导零',
	'Fictional date systems': '虚构历法',
	'Custom calendars for worldbuilding': '用于世界观构建的自定义历法',
	'Calendarium integration': 'Calendarium 集成',
	'Sync Calendarium events': '同步 Calendarium 事件',

	'Events & timelines': '事件与时间线',
	'Event display, layout, labels, and event coverage': '事件显示、布局、标签与覆盖范围',
	'Event display': '事件显示',
	'Event type display': '事件类型显示',
	'Show place context': '显示地点上下文',
	'Place context depth': '地点上下文层级',
	'Show marriage type': '显示婚姻类型',
	'Timeline layout': '时间线布局',
	'Default layout': '默认布局',
	'Default timeline template': '默认时间线模板',
	'Timeline labels': '时间线标签',
	'Family events on timelines': '时间线中的家庭事件',
	'Context events': '背景事件',
	'Default timeline context': '默认时间线背景',
	'Context lifespan margin': '背景事件生命期边距',

	'Sex & gender': '性别与称谓',
	'Sex normalization and inclusive options': '性别标准化与包容性选项',
	'Sex normalization mode': '性别标准化模式',
	'Enable gender-neutral parent property': '启用中性父母字段',
	'Parent property label': '父母字段标签',
	'Show pronouns': '显示代词',
	'Romantic relationship label': '伴侣关系称谓',

	'Place organization and coordinate handling': '地点组织与坐标处理',
	'Use category-based subfolders': '按类别使用子文件夹',
	'Category folder overrides': '类别文件夹覆盖',
	'Default place category': '默认地点类别',
	'Default universe': '默认世界',
	'Place lookup': '地点查询',
	'GeoNames username': 'GeoNames 用户名',
	'Heat map intensity': '热力图强度',
	'Map path label outline': '地图路径标签描边',

	'Real-world basemap': '现实世界底图',
	'Basemap provider': '底图提供方',
	'Custom XYZ basemaps': '自定义 XYZ 底图',
	'Legacy BCE year interpretation': '旧版 BCE 年份解释方式',
	'Provider ID': '提供方 ID',
	'Coordinate system': '坐标系统',
	'XYZ tile URL': 'XYZ 瓦片 URL',
	'Attribution': '版权署名',
	'Maximum zoom': '最大缩放级别',
	'Suppress referrer': '隐藏 Referrer',

	'Evidence-based genealogy and DNA workflows': '基于证据的家谱与 DNA 工作流',
	'Research tools': '研究工具',
	'Enable fact-level source tracking': '启用事实级史料追踪',
	'Fact coverage threshold': '事实覆盖阈值',
	'Show research gaps in status tab': '在状态页显示研究缺口',
	'DNA tracking': 'DNA 追踪',
	'Enable DNA match tracking': '启用 DNA 匹配追踪',

	'Property & value aliases': '字段与值别名',
	'Custom frontmatter names and value mappings': '自定义 frontmatter 字段名和值映射',
	'Property aliases': '字段别名',
	'Value aliases': '值别名',

	'Advanced': '高级',
	'Less frequently used settings': '较少使用的设置',
	'Folder filtering': '文件夹筛选',
	'Filter mode': '筛选模式',
	'Staging isolation': '暂存区隔离',
	'Template detection': '模板识别',
	'Auto-detect template folders': '自动识别模板文件夹',
	'Additional template folders': '额外模板文件夹',
	'Relationship calculator': '关系计算器',
	'Max search depth': '最大搜索深度',
	'Logging': '日志',
	'Log level': '日志级别',
	'Obfuscate log exports': '导出日志时脱敏',
	'Export logs': '导出日志',

	'Off': '关闭',
	'Read calendars': '读取历法',
	'Text label': '文字标签',
	'Icon (with tooltip)': '图标（带提示）',
	'Icon with label': '图标 + 标签',
	'None': '无',
	'Date only': '仅日期',
	'Date and location': '日期与地点',
	'Full details': '完整详情'
};

const SKIP_TAGS = new Set(['CODE', 'PRE', 'KBD', 'SCRIPT', 'STYLE']);

export function resolveUiLanguage(
	preference: UiLanguagePreference | undefined,
	detectedLanguage?: string
): ResolvedUiLanguage {
	if (preference === 'en' || preference === 'zh-CN') return preference;

	const detected = (detectedLanguage
		?? (typeof document !== 'undefined' ? document.documentElement.lang : '')
		?? (typeof navigator !== 'undefined' ? navigator.language : '')
	).trim().toLowerCase();

	return detected === 'zh'
		|| detected.startsWith('zh-')
		|| detected.includes('hans')
		? 'zh-CN'
		: 'en';
}

function translateDynamicZhCn(text: string): string | null {
	let match = text.match(/^Active Workspace: (.+)$/);
	if (match) return `当前工作区：${match[1]}`;

	match = text.match(/^Root: (.+) · Mode: (.+)$/);
	if (match) {
		return `根目录：${match[1]} · 模式：${ZH_CN_TEXT[match[2]] ?? match[2]}`;
	}

	match = text.match(/^Default: (.+)$/);
	if (match) return `默认：${match[1]}`;

	match = text.match(/^Remove “(.+)” from Charted Roots\? Its files under (.+) will not be deleted\.$/);
	if (match) return `从 Charted Roots 中移除“${match[1]}”？位于 ${match[2]} 下的文件不会被删除。`;

	match = text.match(/^Active Workspace: (.+)$/);
	if (match) return `当前工作区：${match[1]}`;

	return null;
}

export function translateUiText(
	text: string,
	language: ResolvedUiLanguage
): string {
	if (language !== 'zh-CN') return text;
	return ZH_CN_TEXT[text] ?? translateDynamicZhCn(text) ?? text;
}

function replaceTextNode(node: Text, language: ResolvedUiLanguage): void {
	const parent = node.parentElement;
	if (!parent || SKIP_TAGS.has(parent.tagName)) return;

	const raw = node.nodeValue ?? '';
	const trimmed = raw.trim();
	if (!trimmed) return;

	const translated = translateUiText(trimmed, language);
	if (translated === trimmed) return;

	const prefix = raw.slice(0, raw.indexOf(trimmed));
	const suffix = raw.slice(raw.indexOf(trimmed) + trimmed.length);
	node.nodeValue = `${prefix}${translated}${suffix}`;
}

/**
 * Localize an already-rendered Charted Roots UI subtree.
 *
 * This deliberately operates on visible strings only. Stable schema keys,
 * command IDs, frontmatter names and file paths remain English/machine-safe.
 */
export function localizeUiTree(
	root: HTMLElement,
	language: ResolvedUiLanguage
): void {
	if (language !== 'zh-CN') return;

	const nodeFilter = root.ownerDocument.defaultView?.NodeFilter;
	if (nodeFilter) {
		const walker = root.ownerDocument.createTreeWalker(
			root,
			nodeFilter.SHOW_TEXT
		);
		const textNodes: Text[] = [];
		let node = walker.nextNode();
		while (node) {
			textNodes.push(node as Text);
			node = walker.nextNode();
		}
		for (const textNode of textNodes) replaceTextNode(textNode, language);
	}

	for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
		if (SKIP_TAGS.has(element.tagName)) continue;
		for (const attr of ['placeholder', 'title', 'aria-label'] as const) {
			const value = element.getAttribute(attr);
			if (!value) continue;
			const translated = translateUiText(value, language);
			if (translated !== value) element.setAttribute(attr, translated);
		}
	}
}
