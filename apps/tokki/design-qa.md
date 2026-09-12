# Tokki POS — Design QA

Date: 2026-09-07
Target: Hyundai HT8LAB1PBKLTM, physical 1280×800, WebView 854×462 CSS px
Reference: selected “Tablero Express” option 2 and supplied six-step Tokki menu
Evidence: `audit/21-builder-comparison.png`, `audit/24-tablet-builder-installed.png`, `audit/29-portrait-comparison.png`, `audit/30-tablet-portrait-home.png`, `audit/31-tablet-portrait-builder.png`

## Result

- P0: none. Catalog, ticket, payment sheet, actions and recovery state fit the actual viewport.
- P1: none. Required takeaway name is visible; controls remain reachable; payment confirmation cannot proceed with insufficient cash.
- P2: none. The six steps, ticket summary and sticky total remain visible at 1280×800 and 854×462; long option lists scroll inside their own step without moving the checkout actions.
- P3: none blocking. The installed app uses Tokki's real mascot/product images plus the existing icon library; exact food illustrations can be enriched later from Admin without changing the flow.

## Functional checks

- Product add/remove/quantity: passed.
- Required takeaway name: passed.
- Responsive home at 854×462: passed.
- Product customization at 854×462: passed.
- Portrait catalog and ticket at 800×1280: passed; catalog uses two columns and the order remains fully accessible below it.
- Portrait six-step builder: passed; steps scroll vertically while compact summary, total and add action remain fixed.
- Android automatic rotation between portrait and landscape: passed.
- Six-step fallback menu before Admin modifier setup: passed; selections are preserved in the order notes and synthetic IDs are not sent to the API.
- Server modifier groups when configured in Admin: passed by code path; their real IDs and recargos take precedence over fallback choices.
- Companion switch (Baby Panda, Panda, King Panda), multi-select toppings, notes and live total: passed.
- Payment methods/keypad/footer at 854×462: passed.
- Settings button and scrollable side panel at 854×462: passed.
- IVA, payment methods, receipt copies and catalog density controls: passed.
- Real order persistence and offline queue wired: passed by build/code path; production completion requires a valid device link, employee PIN and an open shift.
- Lint: passed with existing non-blocking warnings.
- Production build: passed.
- Android debug APK build and replacement installation on Hyundai tablet: passed.

final result: passed
