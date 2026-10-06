import OL from 'obsidian-launcher';
import CDP from 'chrome-remote-interface';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.CR_E2E_CDP_PORT || 9222);
const APP_VERSION = process.env.OBSIDIAN_APP_VERSION || 'latest';
const INSTALLER_VERSION = process.env.OBSIDIAN_INSTALLER_VERSION || 'earliest';

const ELECTRON_ARGS = [
	'--no-sandbox',
	'--disable-gpu',
	'--disable-dev-shm-usage',
	'--disable-software-rasterizer',
	'--remote-allow-origins=*',
	`--remote-debugging-port=${PORT}`
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function launchObsidian({ vault }) {
	if (!existsSync(path.join(REPO_ROOT, 'main.js'))) {
		throw new Error('main.js not found. Build the plugin before running E2E.');
	}

	const launcher = new OL();
	const { proc } = await launcher.launch({
		appVersion: APP_VERSION,
		installerVersion: INSTALLER_VERSION,
		vault,
		copy: true,
		plugins: [{ path: REPO_ROOT }],
		args: ELECTRON_ARGS,
		spawnOptions: { stdio: 'ignore' }
	});

	let client;
	const close = async () => {
		if (client) await client.close().catch(() => {});
		proc.kill('SIGKILL');
	};

	try {
		let target;
		for (let i = 0; i < 120 && !target; i++) {
			try {
				const targets = await CDP.List({ port: PORT });
				target =
					targets.find(item => item.type === 'page' && item.url.startsWith('app://'))
					?? targets.find(item => item.type === 'page');
			} catch {
				// Obsidian is still starting.
			}
			if (!target) await sleep(500);
		}
		if (!target) throw new Error('Obsidian CDP page target never appeared.');

		client = await CDP({ port: PORT, target });
		await client.Runtime.enable();
		await client.Page.enable();

		const evalInApp = async (body) => {
			const { result, exceptionDetails } = await client.Runtime.evaluate({
				expression: `(async () => { ${body} })()`,
				awaitPromise: true,
				returnByValue: true
			});
			if (exceptionDetails) {
				throw new Error(
					exceptionDetails.exception?.description
					?? JSON.stringify(exceptionDetails)
				);
			}
			return result.value;
		};

		const waitFor = async (expr, { timeout = 60000, interval = 250 } = {}) => {
			const deadline = Date.now() + timeout;
			for (;;) {
				if (await evalInApp(`return !!(${expr});`)) return;
				if (Date.now() > deadline) {
					throw new Error(`waitFor timed out: ${expr}`);
				}
				await sleep(interval);
			}
		};

		const screenshot = async (outputPath) => {
			const shot = await client.Page.captureScreenshot({ format: 'png' });
			await mkdir(path.dirname(outputPath), { recursive: true });
			await writeFile(outputPath, Buffer.from(shot.data, 'base64'));
		};

		await waitFor(
			`window.app?.workspace?.layoutReady
				&& window.app?.plugins?.plugins?.['charted-roots']`
		);

		return { evalInApp, waitFor, screenshot, close };
	} catch (error) {
		await close();
		throw error;
	}
}
