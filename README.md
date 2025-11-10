# Beat Lyric Language Support Extension for VS Code

<p align="center">
  <img alt="GitHub License" src="https://img.shields.io/github/license/OLDRedstone/brc-language-support">
  <img src="https://img.shields.io/visual-studio-marketplace/d/brc
	" alt="Downloads"/>
</p>

This extension provides an optional runtime dynamic highlighting layer that only applies to the `brc` language. It is extension-scoped and does not modify the user's theme or settings.json (it will not change `workbench.colorCustomizations` or `editor.tokenColorCustomizations`).

Configuration (edit in the Settings UI or in `settings.json`):

- `brc.dynamicHighlighting.enabled` (boolean, default: true)
	- Enable the extension's runtime highlighting layer (decorations). When set to `false`, the extension will remove all its runtime decorations and defer entirely to the user's theme.

- `brc.dynamicHighlighting.colors` (object)
	- Customize per-token colors used by the extension when dynamic highlighting is enabled. Keys are the semantic token types supported by this extension. Supported token types include:
		`duration`, `number`, `color`, `string`, `value`, `boolean`, `null`, `word`, `key`, `align`, `continuation`, `separator`, `terminator`.

Example (place in your `settings.json`):

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