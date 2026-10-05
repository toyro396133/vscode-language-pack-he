# Proposed update for microsoft/vscode-loc#1911

Hello VS Code localization team,

We now have a maintained Hebrew language-pack baseline synchronized with VS Code 1.140.0, and would like guidance on moving it into the official Microsoft localization pipeline.

The maintained repository is:
https://github.com/toyro396133/vscode-language-pack-he

Current release:
https://github.com/toyro396133/vscode-language-pack-he/releases/tag/v1.140.0

The current 1.140.0 baseline contains:

- 26,084 VS Code core strings;
- 4,062 strings across 93 built-in extensions;
- 30,146 strings total.

For the 1.138 → 1.140 update, the source delta contained 1,683 items: 1,588 new strings and 95 English strings whose wording changed. All 1,683 were covered, and a fresh comparison against the VS Code 1.140.0 source snapshot now reports a zero-item delta.

The repository also has automated QA for:

- source/translation key parity;
- JSON and manifest validity;
- numeric placeholder preservation;
- problematic Unicode BiDi control characters;
- translation statistics;
- reproducible source extraction and release diffs;
- VSIX packaging and content verification.

We understand from the vscode-loc documentation that supported-language strings are managed through the Microsoft Localization Platform (MLCP) and exported to this repository, so we do not want to submit tens of thousands of strings through the wrong workflow.

Could the localization team please clarify the concrete onboarding requirements for Hebrew (`he`)?

In particular:

1. Which MLCP locale should map to VS Code language ID `he`?
2. Can the existing MIT-licensed community translation be imported as a bootstrap corpus after Microsoft's normal legal/review process, or must it be entered/reviewed inside MLCP?
3. What completeness, reviewer, ownership, and ongoing-maintenance requirements must be met before an official Hebrew language pack can be published?
4. Can Hebrew initially be onboarded without requiring a fully mirrored RTL workbench layout, with RTL/layout improvements tracked independently?

We are prepared to keep the translation synchronized with VS Code releases and maintain the automated localization QA.

Thank you.

---

עברית:

חבילת העברית הקהילתית מסונכרנת כעת במלואה עם VS Code 1.140.0 וכוללת 30,146 מחרוזות. עדכון 1.138 → 1.140 כלל 1,683 מחרוזות חדשות או כאלה שהנוסח האנגלי שלהן השתנה, וכולן טופלו. בדיקה חוזרת מול מקור 1.140 מחזירה delta של 0.

המטרה כעת אינה להתחיל את התרגום מחדש, אלא לקבל הנחיות קונקרטיות כיצד לצרף את עברית (`he`) ל-Microsoft Localization Platform ולמסלול הפרסום הרשמי של VS Code, גם אם שיפורי RTL מלאים יטופלו בנפרד.
