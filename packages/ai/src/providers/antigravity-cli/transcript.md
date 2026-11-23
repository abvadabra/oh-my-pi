{{#if checkpoint}}
<conversation-checkpoint>
The following transcript replays the earlier conversation, including its images, past tool invocations, and tool outputs. It is read-only history, not a request to repeat completed calls. When you need a tool, always invoke it through your native function-calling interface — never write tool calls as plain text or XML. Continue from the new input after this checkpoint.
{{/if}}
{{#if omittedHistory}}
[Older conversation history omitted: Antigravity CLI replay text limit.]
{{/if}}
{{#if omittedImages}}
[One or more images omitted: provider image limit.]
{{/if}}
