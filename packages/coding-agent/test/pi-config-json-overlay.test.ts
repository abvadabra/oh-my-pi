import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { getProjectAgentDir, TempDir } from "@oh-my-pi/pi-utils";
import { beginSettingsTest, restoreSettingsTestState, type SettingsTestState } from "./helpers/settings-test-state";

describe("PI_CONFIG_JSON inline overlay", () => {
	let settingsState: SettingsTestState | undefined;
	let tempDir: TempDir;
	let agentDir: string;
	let projectDir: string;
	let savedEnv: string | undefined;

	beforeEach(() => {
		settingsState = beginSettingsTest();
		tempDir = TempDir.createSync("@pi-config-json-test-");
		agentDir = tempDir.join("agent");
		projectDir = tempDir.join("project");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.mkdirSync(getProjectAgentDir(projectDir), { recursive: true });
		savedEnv = process.env.PI_CONFIG_JSON;
	});

	afterEach(async () => {
		if (savedEnv === undefined) {
			delete process.env.PI_CONFIG_JSON;
		} else {
			process.env.PI_CONFIG_JSON = savedEnv;
		}
		restoreSettingsTestState(settingsState);
		settingsState = undefined;
		await Bun.sleep(0);
		await tempDir?.remove();
	});

	const load = () => Settings.loadReadOnly({ cwd: projectDir, agentDir });

	it("merges an inline JSON object as the last overlay", async () => {
		process.env.PI_CONFIG_JSON = JSON.stringify({
			task: {
				customSystemPrompt: "SHELL-CENTRIC SUBAGENT PROMPT",
				agentToolOverrides: { scout: "bash, read, web_search" },
			},
			tools: {
				descriptionOverrides: { bash: "bash override text" },
				descriptionPatches: { task: [{ find: "scout", replace: "sonic" }] },
			},
		});
		const settings = await load();
		expect(settings.get("task.customSystemPrompt")).toBe("SHELL-CENTRIC SUBAGENT PROMPT");
		expect(settings.get("task.agentToolOverrides")).toEqual({ scout: "bash, read, web_search" });
		expect(settings.get("tools.descriptionOverrides")).toEqual({ bash: "bash override text" });
		expect(settings.get("tools.descriptionPatches")).toEqual({ task: [{ find: "scout", replace: "sonic" }] });
	});

	it("is a no-op when unset or blank", async () => {
		delete process.env.PI_CONFIG_JSON;
		const settings = await load();
		expect(settings.get("task.customSystemPrompt")).toBe("");
		process.env.PI_CONFIG_JSON = "   ";
		const settingsBlank = await load();
		expect(settingsBlank.get("task.customSystemPrompt")).toBe("");
	});

	it("hard-errors on malformed JSON instead of silently using stock settings", async () => {
		process.env.PI_CONFIG_JSON = "{not json";
		await expect(load()).rejects.toThrow(/PI_CONFIG_JSON/);
	});

	it("hard-errors on non-object JSON", async () => {
		process.env.PI_CONFIG_JSON = "[1, 2]";
		await expect(load()).rejects.toThrow(/must be a JSON object/);
	});
});
