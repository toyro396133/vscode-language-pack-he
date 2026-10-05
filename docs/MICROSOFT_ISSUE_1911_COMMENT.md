# Proposed update for microsoft/vscode-loc#1911

Hello VS Code localization team,

We now have a substantially more mature Hebrew language-pack baseline than when this issue was opened.

A community-maintained Hebrew pack is available at `Y-PLONI/vscode-language-pack-he`, building on the earlier work by AMAARETS. The current baseline reports 24,692 translated VS Code core strings across 1,982 modules, plus 4,056 strings across 93 built-in extensions. It also includes tooling to extract the English source strings from an installed VS Code build, diff new/changed strings between releases, and apply reviewed updates.

We have also added automated QA for JSON structure, manifest coverage, source-snapshot parity, numeric placeholders and problematic Unicode BiDi control characters, plus reproducible VSIX packaging.

The `vscode-loc` README explains that supported-language strings are managed in the Microsoft Localization Platform (MLCP) and exported to this repository, so rather than submitting a giant translation PR through the wrong workflow, we would like to move this request to the actual onboarding path.

Could the localization team please clarify the requirements to onboard Hebrew (`he`) as an officially supported VS Code language?

In particular, we need guidance on:

1. the MLCP locale that should map to VS Code language ID `he`;
2. whether the existing MIT-licensed community translation can be imported as a bootstrap corpus after Microsoft's review, or whether it must be entered/reviewed inside MLCP;
3. the completeness, quality and reviewer requirements before an official language pack can be published; and
4. whether Hebrew can initially be onboarded without requiring a fully mirrored RTL workbench layout, while RTL/layout improvements are tracked independently.

We are prepared to keep the translation synchronized with VS Code releases and maintain automated localization QA.

Thank you. This is now less a request to “please translate VS Code” and more a request to connect an existing maintained Hebrew translation to the supported Microsoft localization pipeline.

---

עברית:

מאז פתיחת הבקשה נבנתה חבילת עברית קהילתית מקיפה ומתוחזקת, הכוללת עשרות אלפי מחרוזות של VS Code וכלי סנכרון לגרסאות חדשות. בנוסף הוכנה שכבת QA אוטומטית שבודקת תקינות JSON, התאמה למחרוזות המקור, placeholders ותווי BiDi בעייתיים.

המטרה כעת אינה להתחיל את התרגום מחדש, אלא לקבל הנחיות ברורות כיצד לצרף את עברית (`he`) ל-Microsoft Localization Platform ולמסלול הפרסום הרשמי של VS Code, גם אם תמיכת RTL מלאה תטופל בנפרד.
