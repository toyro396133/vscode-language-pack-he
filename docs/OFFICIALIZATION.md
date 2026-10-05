# Officialization plan: Hebrew (`he`) for Visual Studio Code

## Goal

Move the mature community Hebrew translation into Microsoft's supported localization pipeline without representing a community publisher as Microsoft.

## Current state

The community package currently targets VS Code 1.138 and already contains a large core + built-in-extension translation. The immediate engineering task is synchronization and quality assurance, not a new translation project.

The next community release should be synchronized against the current stable VS Code source snapshot before it is presented as current.

## Phase A: make the community pack boringly reliable

1. Extract a fresh English source snapshot from the target VS Code build:
   `node scripts/vsloc.mjs extract --out source/en.new`
2. Produce the delta:
   `node scripts/vsloc.mjs diff --to source/en.new --json todo.json`
3. Review and translate every newly added or changed English string.
4. Preserve numeric placeholders exactly.
5. Apply the completed delta:
   `node scripts/vsloc.mjs apply --to source/en.new --translated todo.json`
6. Run:
   `npm run qa`
7. Generate statistics:
   `npm run stats`
8. Package and smoke-test the VSIX on Windows, macOS and Linux where contributors are available.

At minimum, smoke-test the menu bar, Explorer, Search, Source Control, Run & Debug, Terminal, Settings, Command Palette, extension-management UI, error dialogs and accessibility labels.

## Phase B: Microsoft onboarding

The `microsoft/vscode-loc` repository states that translation strings for supported languages are managed through the Microsoft Localization Platform (MLCP) and exported to GitHub. Therefore, sending tens of thousands of translation strings as an ordinary pull request is not the official integration path.

Use the existing `microsoft/vscode-loc#1911` request and ask maintainers for the concrete onboarding action required to add Hebrew to MLCP. Supply evidence that Hebrew already has a maintained community translation, an English-source snapshot, a release-diff workflow, and automated QA.

The key questions for Microsoft are:

1. Can `he` be onboarded as a supported VS Code language?
2. Which MLCP locale identifier should map to VS Code language ID `he`?
3. Can Microsoft bootstrap MLCP from the existing MIT-licensed community translation after its normal legal/review process?
4. What completeness, review and ownership requirements must be met before publication?
5. Can the initial Hebrew language pack ship without requiring a fully mirrored RTL workbench layout, with RTL/layout improvements tracked independently?

## Phase C: official package metadata

Only after Microsoft accepts Hebrew into its localization pipeline should the package be represented as an official Microsoft language pack.

Expected official shape is analogous to existing packages in `microsoft/vscode-loc`:

- package name: `vscode-language-pack-he`
- language ID: `he`
- language name: `Hebrew`
- localized language name: `עברית`
- category: `Language Packs`
- repository: `Microsoft/vscode-loc`
- publisher: Microsoft's localization publisher, set by Microsoft during onboarding

## RTL policy

Do not block Hebrew localization on a full workbench RTL redesign. Text localization and a fully mirrored UI layout are different engineering layers.

The translation should avoid injecting Unicode directional-control characters unless Microsoft explicitly requires them. Rendering/layout defects should be fixed at the UI layer rather than hidden inside individual strings.

## Acceptance gate before requesting official publication

- Zero invalid JSON files.
- Zero forbidden BiDi-control characters in translated values.
- Zero missing or stale keys relative to the selected English source snapshot.
- Zero numeric-placeholder mismatches.
- Stable terminology for Git, editor, filesystem, debug, terminal and accessibility vocabulary.
- A reproducible update procedure for every VS Code release.
- At least one native Hebrew reviewer other than the person who generated any bulk translation pass.
