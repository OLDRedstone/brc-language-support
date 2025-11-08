# BRC 扩展动态高亮（extension-scoped）

本扩展提供可选的运行时动态高亮层，仅针对 `brc` 语言生效，并且不会修改或写入用户的主题或 settings.json（即不会改动 `workbench.colorCustomizations` 或 `editor.tokenColorCustomizations`）。

配置项（在 settings UI 或 settings.json 中修改）：

- `brc.dynamicHighlighting.enabled` (boolean, 默认 true)
	- 是否启用扩展的动态高亮（装饰器层）。若设为 `false`，扩展会清除其所有运行时装饰，完全保留用户主题的显示。

- `brc.dynamicHighlighting.colors` (object)
	- 可按 token 类型自定义颜色（十六进制字符串）。扩展支持的 token 类型包括：`duration`, `number`, `color`, `string`, `value`, `boolean`, `null`, `word`, `property`, `align`, `continuation`, `separator`, `terminator`。

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
		"word": "#e0e0e0",
		"key": "#9CDCFE",
		"align": "#0087cf",
		"continuation": "#ffdd00",
		"separator": "#005685",
		"terminator": "#ff9900"
	}
}
```