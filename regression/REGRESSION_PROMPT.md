# Regression QA Prompt — Animal Image Generator

Use this prompt to run a full regression test pass after any significant feature work.
Paste it into Claude Code at the start of a QA session.

---

```
Task: Run a full regression test pass on the animal image generator purchase funnel and report issues like a QA engineer.

IMPORTANT:
Do not redesign or refactor anything during this step unless explicitly asked.
This task is for testing, verification, and reporting.
If you fix something, clearly separate:
1. findings
2. proposed fix
3. actual fix made

Act like a QA engineer validating the current build after a major version step.

--------------------------------------------------
PRODUCT CONTEXT
--------------------------------------------------

This app is an AI animal image generator with this funnel:

1. User lands on landing page
2. User goes to /pricing
3. User buys credits through Stripe
4. User lands on /success
5. Credits are confirmed
6. User enters /generator
7. User uploads a pet photo
8. User chooses a theme
9. User optionally adds keywords
10. User generates ONE image
11. User can download that image
12. User can generate again if credits remain
13. When credits reach 0, generation is disabled and user is directed back to /pricing

Core business rules:
- one generation = one image
- each generation consumes exactly 1 credit
- downloading does not consume credits
- credits must remain visible in generator flow
- when credits reach 0, generate is disabled
- user should see a clear zero-credit state
- app should preserve existing layout and style

--------------------------------------------------
YOUR JOB
--------------------------------------------------

Inspect the current implementation and run a regression test against the purchase flow, credit behavior, and key UI states.

Check:
- routing
- UI behavior
- credit logic
- result behavior
- edge cases
- mobile friendliness
- obvious UX confusion
- broken states
- misleading text
- anything that violates the business rules above

Do not assume the app is correct just because the feature was recently implemented.

--------------------------------------------------
REGRESSION TEST CHECKLIST
--------------------------------------------------

A. LANDING PAGE
- verify landing page loads
- verify CTA goes to /pricing
- verify page structure is clear
- verify no broken image references
- verify mobile layout is usable
- verify headline, supporting text, and trust cues are present
- verify no obvious style mismatches with the rest of the app

B. PRICING PAGE
- verify /pricing loads correctly
- verify Starter and Most Popular options render correctly
- verify CTA/button behavior is correct
- verify no broken Stripe handoff
- verify pricing copy is clear and not misleading
- verify mobile layout is usable
- verify no extra or dead-end UI elements

C. CHECKOUT FLOW
- verify checkout request is created correctly
- verify allowed price IDs are enforced
- verify cancel path is handled safely
- verify successful payment path routes correctly
- verify no client-side trust issues around price selection
- verify user is not dropped into a broken state after returning from Stripe

D. SUCCESS PAGE
- verify /success loads correctly after payment
- verify session_id handling is safe
- verify the user sees credits confirmed
- verify credit amount shown matches purchased pack
- verify primary CTA routes into generator flow
- verify optional secondary action behaves correctly
- verify screen uses the intended simple confirmation style
- verify no layout mismatch or weird color theme drift

E. GENERATOR PAGE
- verify generator loads correctly
- verify credit counter is visible
- verify credit counter shows the expected value
- verify upload control works
- verify theme selection works
- verify keyword input works if present
- verify generate button state is correct
- verify generate button is disabled when prerequisites are missing
- verify layout remains intact and is not redesigned
- verify mobile layout is usable

F. GENERATION BEHAVIOR
- verify one generation produces ONE image only
- verify no image grid is shown
- verify result state shows:
  - large single image
  - download button
  - generate another button
  - updated credit count
- verify generation decrements credits by exactly 1
- verify download does not decrement credits
- verify remix/suggested style buttons generate a new image using the same photo
- verify remix buttons also consume exactly 1 credit
- verify the user always understands how many credits remain

G. ZERO-CREDIT STATE
- verify when credits reach 0:
  - generate button is disabled
  - clear message appears
  - link/button to /pricing appears
- verify remix buttons cannot bypass zero-credit lockout
- verify user cannot continue generating at 0 credits
- verify zero-credit state is visually clear and not confusing

H. STATE / PERSISTENCE TESTS
- verify refresh behavior on generator page
- verify refresh behavior on success page
- verify back-button behavior after payment
- verify direct visit to /generator without credits
- verify direct visit to /success without valid session_id
- verify localStorage behavior if currently used for credits
- verify app behavior after clearing localStorage
- verify app behavior in incognito/private browsing
- verify app behavior across tabs
- verify app behavior after buying twice in a row

I. UPLOAD / FILE TESTS
- verify no-image state
- verify invalid file type handling
- verify large image handling
- verify small image handling
- verify HEIC/iPhone image handling if supported
- verify upload preview and generation flow still work after replacing the image

J. UX / CONFUSION TESTS
- identify moments where a non-technical user may hesitate
- identify unclear button labels
- identify places where the app asks the user to think too much
- identify missing reassurance or missing feedback
- identify any step where a paid user could get stuck
- identify any place where credits could feel unfair or confusing

--------------------------------------------------
REQUIRED OUTPUT FORMAT
--------------------------------------------------

Return findings in this exact format:

1. PASS / FAIL SUMMARY
- overall status
- critical failures
- medium issues
- low issues

2. TEST RESULTS BY AREA
- Landing Page
- Pricing Page
- Checkout Flow
- Success Page
- Generator
- Generation Behavior
- Zero-Credit State
- State / Persistence
- Upload / File Handling
- UX / Confusion

For each section, list:
- PASS items
- FAIL items
- RISKS
- RECOMMENDED FIXES

3. BUG LIST
For each bug include:
- title
- severity: critical / medium / low
- reproduction steps
- expected result
- actual result
- likely cause
- recommended fix

4. REGRESSION VERDICT
Choose one:
- SAFE TO CONTINUE
- SAFE WITH MINOR FIXES
- NOT SAFE TO CONTINUE

5. OPTIONAL QUICK FIXES
Only include if they are small and low-risk.
Do not apply them automatically unless explicitly asked.

--------------------------------------------------
TESTING STYLE
--------------------------------------------------

Be skeptical.
Act like this build is going to real users.
Focus on:
- broken purchase flow
- broken credit logic
- result flow errors
- zero-credit loopholes
- mobile friction
- boomer-user confusion

If something is uncertain, say so clearly.
Do not invent results.
Inspect the implementation and reason carefully from the actual code and behavior.
```
