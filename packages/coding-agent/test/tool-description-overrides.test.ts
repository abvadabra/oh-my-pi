import { describe, expect, it } from "bun:test";
import { applyDescriptionOverrides, type Tool, type ToolSession } from "@oh-my-pi/pi-coding-agent/tools";

interface FakeSessionConfig {
	overrides?: Record<string, string>;
	patches?: Record<string, Array<{ find: string; replace: string }>>;
	activeTools?: string[];
}

function fakeSession(config: FakeSessionConfig): ToolSession {
	const values: Record<string, unknown> = {
		"tools.descriptionOverrides": config.overrides ?? {},
		"tools.descriptionPatches": config.patches ?? {},
		"async.enabled": true,
		"launch.enabled": false,
	};
	return {
		settings: { get: (key: string) => values[key] },
		isToolActive: (name: string) => (config.activeTools ?? []).includes(name),
	} as unknown as ToolSession;
}

function staticTool(name: string, description: string): Tool {
	return { name, description } as Tool;
}

class GetterTool {
	readonly name = "bash";
	calls = 0;
	get description(): string {
		this.calls++;
		return "Use ONLY for: computing facts. More text here.";
	}
}

describe("applyDescriptionOverrides", () => {
	it("replaces a static description wholesale", () => {
		const tool = staticTool("bash", "original");
		applyDescriptionOverrides(fakeSession({ overrides: { bash: "shell is primary" } }), [tool]);
		expect(tool.description).toBe("shell is primary");
	});

	it("renders override templates with roster flags", () => {
		const tool = staticTool("bash", "original");
		const session = fakeSession({
			overrides: { bash: "{{#if hasRead}}read on{{else}}read off{{/if}}" },
			activeTools: ["read"],
		});
		applyDescriptionOverrides(session, [tool]);
		expect(tool.description).toBe("read on");

		const toolNoRead = staticTool("bash", "original");
		applyDescriptionOverrides(fakeSession({ overrides: { bash: "{{#if hasRead}}read on{{else}}read off{{/if}}" } }), [
			toolNoRead,
		]);
		expect(toolNoRead.description).toBe("read off");
	});

	it("patches a dynamic getter description lazily", () => {
		const tool = new GetterTool();
		applyDescriptionOverrides(
			fakeSession({
				patches: { bash: [{ find: "Use ONLY for: computing facts.", replace: "Primary shell tool." }] },
			}),
			[tool as unknown as Tool],
		);
		expect(tool.calls).toBe(0);
		expect((tool as unknown as Tool).description).toBe("Primary shell tool. More text here.");
		expect(tool.calls).toBe(1);
		// Getter stays live — each read re-renders underneath the patch.
		expect((tool as unknown as Tool).description).toBe("Primary shell tool. More text here.");
		expect(tool.calls).toBe(2);
	});

	it("skips unmatched patches without failing", () => {
		const tool = staticTool("task", "roster: scout, sonic");
		applyDescriptionOverrides(
			fakeSession({
				patches: {
					task: [
						{ find: "NOT PRESENT", replace: "x" },
						{ find: "scout", replace: "ranger" },
					],
				},
			}),
			[tool],
		);
		expect(tool.description).toBe("roster: ranger, sonic");
	});

	it("applies patches on top of an override", () => {
		const tool = staticTool("bash", "original");
		applyDescriptionOverrides(
			fakeSession({
				overrides: { bash: "overridden text" },
				patches: { bash: [{ find: "overridden", replace: "patched" }] },
			}),
			[tool],
		);
		expect(tool.description).toBe("patched text");
	});

	it("leaves tools without overrides untouched", () => {
		const tool = staticTool("write", "write description");
		const descriptorBefore = Object.getOwnPropertyDescriptor(tool, "description");
		applyDescriptionOverrides(fakeSession({ overrides: { bash: "x" } }), [tool]);
		expect(Object.getOwnPropertyDescriptor(tool, "description")).toEqual(descriptorBefore);
	});
});
