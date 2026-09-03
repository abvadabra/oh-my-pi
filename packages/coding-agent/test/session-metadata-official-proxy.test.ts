import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Api, Model } from "@oh-my-pi/pi-ai";
import { buildSessionMetadata } from "../src/session/session-metadata";

/**
 * Claude-Code attribution metadata (`{session_id, account_uuid, device_id}`)
 * for a registered `anthropic-messages` provider that stands in for the
 * official API — a trusted host proxy declared via
 * `PI_ANTHROPIC_OFFICIAL_BASE_URLS`, holding the credential itself and
 * handing the account UUID over as `PI_ANTHROPIC_ACCOUNT_UUID`.
 */
describe("buildSessionMetadata for an official-equivalent proxy provider", () => {
	const saved: Record<string, string | undefined> = {};
	const set = (name: string, value: string | undefined) => {
		if (!(name in saved)) saved[name] = process.env[name];
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	};
	beforeEach(() => {
		set("PI_ANTHROPIC_OFFICIAL_BASE_URLS", "http://127.0.0.1:8735/agent-gw/sub");
		set("PI_ANTHROPIC_ACCOUNT_UUID", "11111111-2222-4333-8444-555555555555");
	});
	afterEach(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	const model = (overrides: Partial<Model<Api>>): Model<Api> =>
		({
			provider: "gb-sub-anthropic",
			api: "anthropic-messages",
			isOAuth: true,
			baseUrl: "http://127.0.0.1:8735/agent-gw/sub",
			...overrides,
		}) as Model<Api>;
	const parse = (meta: Record<string, unknown>) => JSON.parse(meta.user_id as string) as Record<string, string>;

	it("attributes the account and derives a device id, like the built-in provider would", () => {
		const meta = parse(buildSessionMetadata("sess-1", "gb-sub-anthropic", undefined, () => model({})));
		expect(meta.session_id).toBe("sess-1");
		expect(meta.account_uuid).toBe("11111111-2222-4333-8444-555555555555");
		expect(meta.device_id).toMatch(/^[0-9a-f]{64}$/);
	});

	it("stays session-only for the same provider on an undeclared base", () => {
		const meta = parse(
			buildSessionMetadata("sess-1", "gb-sub-anthropic", undefined, () =>
				model({ baseUrl: "http://127.0.0.1:8735/agent-gw/v1" }),
			),
		);
		expect(meta).toEqual({ session_id: "sess-1" });
	});

	it("never attributes a non-Anthropic wire or an API-key provider, even on a declared base", () => {
		expect(
			parse(buildSessionMetadata("s", "gb-sub-openai", undefined, () => model({ api: "openai-responses" }))),
		).toEqual({ session_id: "s" });
		expect(parse(buildSessionMetadata("s", "gb-sub-anthropic", undefined, () => model({ isOAuth: false })))).toEqual({
			session_id: "s",
		});
		expect(parse(buildSessionMetadata("s", "unknown", undefined, () => undefined))).toEqual({ session_id: "s" });
	});

	it("omits the account when the host declared none", () => {
		set("PI_ANTHROPIC_ACCOUNT_UUID", undefined);
		expect(parse(buildSessionMetadata("s", "gb-sub-anthropic", undefined, () => model({})))).toEqual({
			session_id: "s",
		});
	});
});
