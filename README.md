# BRC 扩展动态高亮（extension-scoped）

本扩展提供可选的运行时动态高亮层，仅针对 `brc` 语言生效，并且不会修改或写入用户的主题或 settings.json（即不会改动 `workbench.colorCustomizations` 或 `editor.tokenColorCustomizations`）。

配置项（在 settings UI 或 settings.json 中修改）：

- `brc.dynamicHighlighting.enabled` (boolean, 默认 true)
	- 是否启用扩展的动态高亮（装饰器层）。若设为 `false`，扩展会清除其所有运行时装饰，完全保留用户主题的显示。

- `brc.dynamicHighlighting.colors` (object)
	- 可按 token 类型自定义颜色（十六进制字符串）。扩展支持的 token 类型包括：`duration`, `number`, `color`, `string`, `value`, `boolean`, `null`, `identifier`, `property`, `align`, `continuation`, `separator`, `terminator`。
	- `value` 是新增的 token 类型，用于表示方括号属性集合（`[...]`）中未加引号的右侧值（例如 `[foo=bar]` 中的 `bar` 会被标记为 `value`）。

示例（在 settings.json 中）：

```json
{
	"brc.dynamicHighlighting.enabled": true,
	"brc.dynamicHighlighting.colors": {
		"duration": "#005685",
		"number": "#b5cea8",
		"color": "#D4BFFF",
		"string": "#ce9178",
		"value": "#9cdcfe",
		"boolean": "#569CD6",
		"null": "#569CD6",
		"identifier": "#e0e0e0",
		"property": "#9CDCFE",
		"align": "#0087cf",
		"continuation": "#ffdd00",
		"separator": "#005685",
		"terminator": "#ff9900"
	}
}
```

注意事项：

- 动态高亮使用 `TextEditorDecorationType` 在编辑器层面应用颜色，视觉上会覆盖主题对文本颜色的默认渲染（这是设计行为，以便扩展能在不修改用户配置的情况下提供一致效果）。
- 如果你更希望主题/语义 tokens 决定颜色，可以将 `brc.dynamicHighlighting.enabled` 设为 `false`，扩展仍保留语义 token provider（semantic tokens），并且 `package.json` 已将 `value` 声明为一个 semantic token type，主题可为其提供颜色。

引号规则（重要）

- 在属性列表（`[...]`）内部：
	- 引号（单引号或双引号）被视为字符串定界符，仅当它们未被反斜杠转义时才开始/结束一个带引号字符串。
	- 未加引号的值（value）如果包含引号字符，必须对引号进行转义（例如 `\"` 或 `\'`）；否则解析器会生成 diagnostics（警告）指出“Unescaped quote inside unquoted property value”。
	- 方括号内部会识别并解码转义序列（例如 `\]`、`\'`、`\\`），token.text 中为解码后的文本，但 token.start/length 保持对应源文本位置以便高亮范围正确。

- 在属性列表外部：
	- 单引号或双引号不再被视为会跨越整个文件或行的字符串界定符（这就是你在样例中看到的 `he's` 不应被当成字符串的原因）。
	- 换句话说，`he's`、`don't` 等字符串中的单引号会被当作普通字符，identifier 也可以包含未转义的引号字符（扩展会把它们作为 identifier/普通文本处理，而不会尝试配对为字符串）。

因此：如果你需要在属性列表中表达一个包含引号的文字，请在 value 中转义引号；而在普通文本/行内，你可以直接使用引号字符，无需转义。

验证解析器行为（开发者）：

在项目根目录运行解析器的严格测试来验证解析器：

```powershell
node .\tools\run_tests_strict.js
```

测试通过说明解析器对方括号内的值已正确标记为 `value`（如果你修改了解析器或 token 列表，请先运行此测试）。

性能提示：

- 扩展对文档变更做了短时防抖以减少频繁渲染（默认 200ms）。若你的文件非常大或渲染开销较高，可以在将来优化为只渲染可见视口范围。