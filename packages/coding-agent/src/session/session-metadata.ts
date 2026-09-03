import { type Api, deriveClaudeDeviceId, type Model } from "@oh-my-pi/pi-ai";
import { isOfficialAnthropicApiUrl } from "@oh-my-pi/pi-catalog/compat/anthropic";
import { $env, getInstallId } from "@oh-my-pi/pi-utils";
import type { AuthStorage } from "./auth-storage";

/**
 * Build the per-request `metadata` payload for the Anthropic provider, shaped
 * like real Claude Code's `getAPIMetadata` output (`{ session_id, account_uuid,
 * device_id }`) so the backend buckets requests under one session and attributes
 * them to the authenticated OAuth account when available. Resolved at request
 * time so token refreshes and login/logout transitions don't strand a stale
 * account UUID in memory. `account_uuid` and `device_id` are omitted for
 * non-Anthropic providers to avoid leaking the user's Claude identity to
 * third-party APIs (including Anthropic-format-compatible proxies such as
 * cloudflare-ai-gateway or gitlab-duo).
 *
 * Installed via `Agent#setMetadataResolver` on the main `AgentSession`, each
 * subagent session, and the separately constructed advisor `Agent` — each with
 * its own provider session id — so Main, subagent, and Advisor requests each
 * expose a distinct, stable provider-facing session identity.
 *
 * `provider` is the target provider string (e.g. `"anthropic"`) and gates the
 * `account_uuid` and `device_id` lookups — only `"anthropic"` requests carry them.
 *
 * `sessionId` is forwarded to the auth-storage session-sticky lookup so that
 * multi-credential setups attribute to the same OAuth account used for the
 * actual API request rather than always picking the first credential.
 *
 * `authStorage` is treated as optional so test fixtures that stub `modelRegistry`
 * without a real storage layer still work; the resolver simply skips the lookup
 * and emits `{ session_id }` alone, matching the no-OAuth-credential path.
 *
 * `resolveProviderModel` looks up a registered provider's model so a
 * host-declared official-equivalent proxy (see below) can be recognised.
 */
export function buildSessionMetadata(
	sessionId: string,
	provider: string,
	authStorage: AuthStorage | undefined,
	resolveProviderModel?: (provider: string) => Model<Api> | undefined,
): Record<string, unknown> {
	const userId: Record<string, string> = { session_id: sessionId };
	// Only look up account_uuid when the request is going to Anthropic. Injecting
	// a Claude OAuth account_uuid into requests bound for other providers (including
	// Anthropic-format-compatible proxies like cloudflare-ai-gateway or gitlab-duo)
	// would leak the user's Anthropic identity to unrelated third-party APIs.
	//
	// "Going to Anthropic" is the built-in provider, or a registered
	// `anthropic-messages` provider whose base URL the host declared
	// official-equivalent (a trusted local proxy forwarding to api.anthropic.com
	// — see `isOfficialAnthropicApiUrl`). Such a host holds the credential
	// itself, so the account UUID arrives as `PI_ANTHROPIC_ACCOUNT_UUID` rather
	// than from auth storage; for the built-in provider auth storage stays the
	// authority and the env is only a fallback.
	const builtIn = provider === "anthropic";
	const viaOfficialProxy = !builtIn && isOfficialAnthropicProxyModel(resolveProviderModel?.(provider));
	if (builtIn || viaOfficialProxy) {
		const stored = authStorage?.getOAuthAccountId("anthropic", sessionId);
		const declared = $env.PI_ANTHROPIC_ACCOUNT_UUID?.trim();
		const accountUuid = builtIn ? (stored ?? declared) : (declared ?? stored);
		if (typeof accountUuid === "string" && accountUuid.length > 0) {
			userId.account_uuid = accountUuid;
			// Claude Code's `device_id` is a stable 64-hex account-scoped install
			// identifier. Include both omp's persistent install id and the Claude
			// account UUID so two accounts on the same install do not share a device.
			userId.device_id = deriveClaudeDeviceId(getInstallId(), accountUuid);
		}
	}
	return { user_id: JSON.stringify(userId) };
}

/** A registered `anthropic-messages` OAuth provider on a host-declared official-equivalent base. */
function isOfficialAnthropicProxyModel(model: Model<Api> | undefined): boolean {
	if (model?.api !== "anthropic-messages" || model.isOAuth !== true) return false;
	return Boolean(model.baseUrl) && isOfficialAnthropicApiUrl(model.baseUrl);
}
