import { describe, expect, it } from "bun:test";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { cfgSkillsCompressDescriptions } from "@oh-my-pi/pi-coding-agent/extensibility/settings";
import { TempDir } from "@oh-my-pi/pi-utils";
import { SkillDescriptionCatalog } from "../src/extensibility/skill-descriptions";
import type { Skill } from "../src/extensibility/skills";

const long: Skill = {
	name: "texture-atlas",
	description:
		"Use when packing sprites into texture atlases, rebuilding atlas pages after art changes, or diagnosing atlas bleeding; not for single standalone images.",
	filePath: "/skills/texture-atlas/SKILL.md",
	baseDir: "/skills/texture-atlas",
	source: "test",
};

describe("skills.compressDescriptions", () => {
	it("is off unless a host turns it on", () => {
		expect(cfgSkillsCompressDescriptions.get(Settings.isolated())).toBe(false);
		expect(cfgSkillsCompressDescriptions.get(Settings.isolated({ "skills.compressDescriptions": true }))).toBe(true);
	});

	it("passes descriptions through verbatim and never asks a model while off", async () => {
		using temp = TempDir.createSync("omp-skill-description-off-");
		let calls = 0;
		const compress = async () => {
			calls++;
			return "compressed";
		};
		const catalog = new SkillDescriptionCatalog({ dbPath: temp.join("skills.db"), compress, enabled: false });
		expect(catalog.render([long])[0]?.description).toBe(long.description);
		expect(catalog.snapshot([long])[0]?.description).toBe(long.description);
		await catalog.waitForPending();
		await Bun.sleep(0);
		expect(calls).toBe(0);
	});

	it("keeps upstream's preview and compression while on", async () => {
		using temp = TempDir.createSync("omp-skill-description-on-");
		let calls = 0;
		const compress = async () => {
			calls++;
			return "Pack sprites into atlases";
		};
		const catalog = new SkillDescriptionCatalog({ dbPath: temp.join("skills.db"), compress, enabled: true });
		const preview = catalog.render([long])[0]?.description;
		expect(preview).not.toBe(long.description);
		expect(preview!.length).toBeLessThanOrEqual(100);
		await catalog.waitForPending();
		expect(calls).toBe(1);
	});
});
