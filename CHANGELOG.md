# Changelog

All notable changes to this project are documented in this file.

## [0.0.1] - 2025-11-08

### Added
- Optional runtime dynamic highlighting layer (extension-scoped) for the `brc` language. This layer uses editor decorations and does not modify user theme or settings.json.
- Per-line section gutter badges and inline section badges after semicolons, with light/dark variants and alignment tuned to match VS Code inline icons.
- New semantic token type `value` to represent unquoted property-list values inside brackets.
- Diagnostics for unescaped quotes inside unquoted bracket values.

### Changed
- Parser (`tools/parse_lib.js`) reworked to support multi-line bracket property lists and to return `tokensByLine` and `bracketRanges` for use by the extension.
- Token renames: external identifiers -> `word`; bracket property names -> `key` (reflected in `package.json` and README).
- Extension decoration logic (`extension.js`) updated to use parser-provided token ranges (ignores semicolons inside brackets), only draw decorations for visible ranges (performance), and place gutter badges at the first non-whitespace column.
- Inline badges switched to use `before` decorations with tuned width/height/margin for better alignment.

### Fixed
- Packaging manifest issues: added `activationEvents` and `license`/`repository` metadata so the packager no longer complains.

### Tests
- Updated strict parser tests (`tools/run_tests_strict.js`, `tools/expectations.json`, `tools/parse_sample_input.txt`) to reflect token renames and multi-line bracket cases. All strict tests pass locally.

### Packaging
- Generated a `.vsix` package successfully using the local build script. Observed a non-blocking Node deprecation warning referencing `punycode` from the packer toolchain.

### Notes / Next steps
- Consider adding CI (GitHub Actions) to run tests and produce `.vsix` artifacts automatically.
- Add `.vscodeignore` and `.gitignore` to avoid shipping development files in the packaged extension.
- Optional: address the `punycode` deprecation by upgrading the packer/tool dependencies if desired.
# Change Log

## [Unreleased]

- Initial release