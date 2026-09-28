# Creative Style ROAS Review

A single page ads analytics dashboard that looks at 30 days of paid social spend on AI generated ad creatives, by generation style and channel. It answers: which styles earn their spend, which ones win the click but lose the sale, where creative fatigue is eating returns, and what moving budget out of below floor styles would do to blended ROAS.

Built as a candidate work sample for Higgsfield AI's Machine Learning Engineer, Ads role. The framing comes from hands on paid media work at IncBud, where I ran ROAS driven budget and creative decisions for fashion clients. The same cohort signals shown here (conversion weighted ROAS, fatigue curves, channel fit) are what an ad ranking or style recommendation model would learn from.

## What it shows

- **Stat tiles**: spend under management, blended ROAS, styles below the ROAS floor (with their share of spend), and projected monthly revenue lift under the current plan.
- **Metric by creative style**: horizontal bars for ROAS, CTR, CPA, or week 1 to week 4 ROAS decay, with below floor styles flagged.
- **CTR against ROAS scatter**: sized by spend, showing that the highest CTR styles are not the highest ROAS styles.
- **Ranked table**: styles ordered by revenue at risk (spend on a below floor style times its shortfall), with a recommended action: scale, hold, refresh creative, rework offer while keeping the hook, or retire. Sortable on every column.
- **Findings**: computed live, including the rank correlation between CTR and ROAS, spend share against revenue share for below floor styles, the fastest decaying style with week 1 and week 4 ROAS, and channel spread for the top style.
- **Action plan**: four numbered actions filled in from the current data.
- **Decision impact**: sliders for share of below floor spend reallocated, marginal efficiency on scaled styles, and share held back for testing new styles. Outputs projected blended ROAS, budget moved, and annualized lift, plus a curve of blended ROAS against share moved that shows where returns peak.

The channel filter and ROAS floor slider drive every view at once.

## Data

All data is synthetic. It is shaped like an ad platform export by creative and channel (spend, impressions, clicks, conversions, revenue, weekly decay) and generated deterministically in `app.js` from per style baselines and per channel effects. It is not Higgsfield AI's data or any advertiser's data, and the page says so in a visible banner.

Modeling assumptions, stated in the page as well:

- Average order value is $62 for every style.
- Reallocated spend goes to Scale styles in proportion to their current spend, with a saturating response: the first extra dollar earns the marginal efficiency setting times the style's average ROAS, and later dollars earn less (logarithmic).
- Test budget earns 80% of the blended average ROAS while new styles learn.
- Week 1 and week 4 ROAS are backed out from the 30 day average and the decay ratio, assuming a linear decline.

## Stack

Plain HTML, CSS, and JavaScript. No build step, no framework, no chart library. Charts are hand built inline SVG (`charts.js`), with a colorblind safe palette validated against the dark surface. All theme values are CSS variables in `styles.css`.

Run it by opening `index.html` through any static file server, or deploy the folder as a static site.

## Author

Vishal Kumar. [Portfolio](https://vishal-kumar-portfolio-six.vercel.app)
