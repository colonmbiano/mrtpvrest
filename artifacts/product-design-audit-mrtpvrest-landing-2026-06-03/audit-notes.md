# MRTPVREST Landing Page Audit

Date: 2026-06-03
Target: https://mrtpvrest.com/
Mode: Combined UX and accessibility audit
Destination: Local folder
Capture tool: Playwright fallback, approved by user

## Captured Evidence

1. `01-desktop-full.png` - Desktop full landing page.
2. `02-desktop-fold.png` - Desktop first fold.
3. `03-mobile-full.png` - Mobile full landing page.
4. `04-mobile-fold.png` - Mobile first fold.
5. `05-desktop-focus-download-cta.png` - Keyboard focus on the hero download CTA.
6. `06-download-cta-result.png` - Result after clicking "Descargar TPV".
7. `07-mobile-demo-result.png` - Result after clicking "Ver demo" on mobile.

## Step List

1. Desktop first fold - Healthy overall. Strong brand, clear product category, visible primary CTA, and proof strip visible before the fold.
2. Desktop full page - Mostly healthy. The page has clear sections, good visual rhythm, and a complete SaaS story from pain to apps, pricing, FAQ, and final CTA.
3. Mobile first fold - Mixed. It keeps the key CTA visible and avoids horizontal overflow, but hides navigation and login, making a long page harder to scan.
4. Mobile full page - Mostly healthy. Content stacks cleanly and cards remain readable, but the long scroll needs better jump/navigation support.
5. Keyboard focus on hero CTA - Mixed. Focus is visible on the green CTA in the captured state, but the keyboard pass showed several default outlines that are too dark against dark or orange surfaces.
6. Download CTA result - Unhealthy. "Descargar TPV" sends users to the admin login, not an APK download, and the URL exposes `tpv-debug.apk`.
7. Mobile demo CTA result - Healthy. "Ver demo" opens a working demo page and gives clear back/register controls.

## Strengths

- The desktop hero has a strong first impression: brand, product promise, three clear actions, trust chips, and product imagery all appear in the first viewport.
- The page has no horizontal overflow in desktop or mobile captures.
- The information architecture is easy to follow: problem, ecosystem, setup steps, restaurant context, testimonials, pricing, FAQ, final CTA.
- The rendered Spanish copy displays correctly on the live site, even though the local source file view shows encoding artifacts.
- Images loaded successfully and had alt text in the rendered DOM.
- The demo path works and feels like a useful next step for a skeptical buyer.

## UX Risks

1. The public "Descargar TPV" CTA is broken as a promise.
   - Evidence: Step 6, `06-download-cta-result.png`.
   - The button sends users to `https://admin.mrtpvrest.com/login` instead of downloading an APK. This is especially risky because the landing page repeats APK/download language and the target URL includes `tpv-debug.apk`, which can reduce trust.
   - Recommendation: Either make the APK download work publicly with a stable production filename, or change the CTA to "Ver descargas" / "Entrar para descargar" and explain that downloads require an account.

2. Mobile users lose section navigation.
   - Evidence: Step 3, `04-mobile-fold.png`; mobile nav inspection shows only logo and "Registrar" visible.
   - The page is long, but mobile hides Plataforma, Apps, Precios, FAQ, and Entrar with no menu replacement.
   - Recommendation: Add a compact menu, bottom jump bar, or at minimum expose "Precios" and "Entrar" in a mobile-safe way.

3. Some clickable app cards do not move the user forward.
   - Evidence: Step 2, rendered link inspection.
   - Several app cards resolve to `#apps`, so clicking them keeps users in the same area even though the cards look actionable.
   - Recommendation: Make each card lead to a meaningful page, demo state, download, or remove the link styling and reserve clicks for actual actions.

4. The desktop hero repeats the logo heavily.
   - Evidence: Step 1, `02-desktop-fold.png`.
   - The nav logo, H1 brand word, and large right-side logo compete with the product/operator photo. The brand is memorable, but the duplicated logo weakens the "show me the product" moment.
   - Recommendation: Replace the large right-side logo plate with a product UI/device composition or move it below the photo as a smaller brand accent.

5. Some proof claims need stronger grounding.
   - Evidence: Step 1 and Step 2.
   - "0 lag" and broad testimonial/proof claims are punchy, but absolute claims can feel less credible without measurement or context.
   - Recommendation: Replace "0 lag" with a more defensible operational phrase, such as "Sincronizacion en vivo", or add a short supporting note.

## Accessibility Risks

1. Focus styling is inconsistent and sometimes low visibility.
   - Evidence: Step 5 and keyboard focus inspection.
   - Several links use the default browser outline, and some computed outlines are very dark on dark/orange surfaces.
   - Recommendation: Add a consistent `:focus-visible` style with a high-contrast outline and offset for nav links, cards, buttons, FAQ summaries, and footer links.

2. Muted text and chips may be under-contrast.
   - Evidence: Step 1 and Step 3.
   - The trust chips and small uppercase metadata are visually subtle. This fits the mood, but some text appears close to the dark background.
   - Recommendation: Raise contrast on `--text-dim` usages in tiny text, especially trust chips, proof labels, section kickers, and footer links.

3. There is no visible skip link.
   - Evidence: DOM and keyboard pass.
   - Keyboard users start through navigation and hero actions before main content. The page is long, so a skip link would help.
   - Recommendation: Add a visually hidden skip link that appears on focus and jumps to `main`.

4. Mobile hidden navigation removes alternative access to page sections.
   - Evidence: Step 3 and mobile nav inspection.
   - This is both a UX and accessibility concern because users who rely on predictable navigation have fewer ways to jump to pricing or FAQ.
   - Recommendation: Provide a mobile navigation control with clear text labels and focusable targets.

## Evidence Limits

- This audit used screenshots, DOM inspection, link checks, and keyboard tab sampling. It does not prove full WCAG compliance.
- I did not test with a screen reader, browser zoom at 200%, reduced motion settings, or real device touch behavior.
- I did not authenticate into the admin app, so the post-login APK/download behavior could not be verified.

## Priority Recommendations

1. Fix or rename the "Descargar TPV" path before sending traffic to the page.
2. Add mobile navigation for long-page jumps and login access.
3. Add consistent high-contrast `:focus-visible` styles.
4. Make app-card clicks lead somewhere useful, or make them non-clickable showcase cards.
5. Reduce the repeated logo in the hero and give the product/operator visual more informational weight.
