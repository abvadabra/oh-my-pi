import { describe, expect, test } from "bun:test";
import { type CompactionPreparation, compact, DEFAULT_COMPACTION_SETTINGS } from "@oh-my-pi/pi-agent-core/compaction";
import * as snapcompact from "@oh-my-pi/snapcompact";
import type { FetchImpl } from "@oh-my-pi/pi-ai/types";
import { buildModel } from "@oh-my-pi/pi-catalog/build";

function preparation(streaming: boolean, remoteTimeoutSeconds: number): CompactionPreparation {
	return {
		firstKeptEntryId: "kept-1",
		messagesToSummarize: [{ role: "user", content: "long history", timestamp: 1 }],
		turnPrefixMessages: [],
		recentMessages: [{ role: "user", content: "recent", timestamp: 2 }],
		isSplitTurn: false,
		tokensBefore: 100_000,
		fileOps: snapcompact.createFileOps(),
		settings: { ...DEFAULT_COMPACTION_SETTINGS, remoteStreamingV2Enabled: streaming, remoteTimeoutSeconds },
	};
}

describe("compaction.remoteTimeoutSeconds", () => {
	test.each(["v1", "v2"])(
		"caps each native compaction attempt at the configured time (%s)",
		async protocol => {
			const streaming = protocol === "v2";
			const model = buildModel({
				id: "gpt-5",
				name: "GPT-5",
				api: "openai-responses",
				provider: "openai",
				baseUrl: "https://api.openai.com/v1",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
				remoteCompaction: { enabled: true, v2StreamingEnabled: streaming },
			});
			// A provider still writing its summary: nothing comes back until the request is cut.
			const attempts: Array<{ ms: number; reason: string }> = [];
			const fetchMock: FetchImpl = (_input, init) => {
				const signal = init?.signal as AbortSignal | undefined;
				const started = performance.now();
				const { promise, reject } = Promise.withResolvers<Response>();
				signal?.addEventListener("abort", () => {
					attempts.push({ ms: performance.now() - started, reason: String(signal.reason?.name) });
					reject(signal.reason);
				});
				return promise;
			};

			const error = await compact(preparation(streaming, 0.05), model, "test-key", undefined, undefined, {
				fetch: fetchMock,
			}).catch(cause => cause);

			expect(error).toBeInstanceOf(Error);
			expect(attempts.length).toBeGreaterThan(0);
			for (const attempt of attempts) {
				expect(attempt.reason).toBe("TimeoutError");
				expect(attempt.ms).toBeLessThan(5_000);
			}
		},
		30_000,
	);
});
