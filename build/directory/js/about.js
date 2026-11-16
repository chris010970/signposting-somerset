/* ---------- About ---------- */
// The "Suggest a change" form (build/site.json: feedback_form_url); without one, About says a form is coming
const FEEDBACK_FORM_URL = "/*FEEDBACK_FORM_URL*/";
const TOOLS_URL = "/*TOOLS_URL*/";   // the tools page beside this copy of the directory (Assist, Analytics)
function renderAbout() {
  const n = ALL.length, providers = new Set(ALL.map(s => s.provider).filter(Boolean)).size;
  const stats = n ? `${n} services from ${providers} providers.` : "Loading services…";
  const suggest = FEEDBACK_FORM_URL
    ? `<p>Spotted something out of date, or know a service that should be here? Local knowledge is what keeps this useful.</p>
       <a class="btn" href="${esc(FEEDBACK_FORM_URL)}" target="_blank" rel="noopener">Suggest a change</a>
       <p class="small">Please don't include personal details about anyone you support.</p>`
    : `<p>Spotted something out of date, or know a service that should be here? Please tell the person who shared this site with you. A suggestion form is coming soon.</p>`;
  $("about-page").innerHTML = `<article class="aboutpage">
    <h2>About Signposting Somerset</h2>
    <div class="note"><strong>Demo version.</strong> Details are checked against each provider's own information, but services change. Please confirm with the service before attending.
      In an emergency call <a href="tel:999">999</a>. For urgent mental health help call NHS <a href="tel:111">111</a> and choose option 2.</div>
    <div class="acols"><div class="acol">
    <section>
    <h3>What it is</h3>
    <p>One place to find local mental health and wellbeing support across Somerset, North Somerset and B&amp;NES: what's on, when and where, and whether someone can go.
      It's built for support workers, volunteers and anyone looking for help, activities or community connections.</p>
    <p class="stats">${esc(stats)}</p>
    </section>
    <section>
    <h3>What's included</h3>
    <ul>
      <li><strong>Specialist support:</strong> crisis support, low mood, anxiety, bereavement, hearing voices, long-term pain, eating disorders, dementia, addiction (alcohol, drugs and gambling), abuse, caring for someone.</li>
      <li><strong>Practical help and support:</strong> money, housing and food, including advice and advocacy.</li>
      <li><strong>Everyday wellbeing:</strong> connection, activity, learning, nature and giving, based on the Five Ways to Wellbeing.</li>
      <li>Helplines and online groups, in-person services on a map, and courses with set dates.</li>
    </ul>
    </section>
    <section>
    <h3>For support workers and volunteers</h3>
    <p>The <a href="${TOOLS_URL}">tools page</a> has Assist: describe someone's situation and it suggests a short plan of support from the services listed here, easiest steps first. It's a trial for invited workers and volunteers (access code needed).</p>
    </section>
    </div><div class="acol">
    <section>
    <h3>How it's kept accurate</h3>
    <ul>
      <li>Every service is checked against the provider's own website, timetable or leaflet, and dated.</li>
      <li>Nothing is guessed: if a provider doesn't say something, it's left blank.</li>
      <li>Some venues are only shared after registration, and Crisis Safe Space addresses are never published. These show at the town centre.</li>
      <li>The records are shared, so people with local knowledge can keep them up to date. Changes appear here within minutes.</li>
    </ul>
    </section>
    <section>
    <h3>Suggest a change</h3>
    ${suggest}
    </section>
    </div></div>
    <p class="small">Service information belongs to the providers listed. Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>.</p>
    <p class="small" id="site-version">Version: /*SITE_VERSION*/</p>
  </article>`;
}
