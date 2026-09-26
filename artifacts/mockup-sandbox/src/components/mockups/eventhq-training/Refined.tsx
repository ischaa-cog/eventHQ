import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronRight, Clock3, ExternalLink, GraduationCap, Menu, Play, Search, X } from "lucide-react";
import "./_group.css";
import "./refined.css";

type CategoryId = "challenge" | "marketing" | "masterclass" | "bonus_training" | "webinar" | "summit" | "partner_sop";
type Resource = { id: string; title: string; category: CategoryId; order: number; description: string };

const categories: { id: CategoryId; label: string; eyebrow: string; detail: string; count: number }[] = [
  { id: "challenge", label: "Five-Day Challenges", eyebrow: "01", detail: "Plan and run a successful challenge.", count: 11 },
  { id: "marketing", label: "Marketing", eyebrow: "02", detail: "Podcast and social media training.", count: 3 },
  { id: "masterclass", label: "Masterclass", eyebrow: "03", detail: "Masterclass training and resources.", count: 1 },
  { id: "bonus_training", label: "Bonus Training", eyebrow: "04", detail: "Additional lessons and speaker training.", count: 1 },
  { id: "webinar", label: "Webinars", eyebrow: "05", detail: "Webinar training and resources.", count: 0 },
  { id: "summit", label: "Summits", eyebrow: "06", detail: "Summit training and resources.", count: 0 },
  { id: "partner_sop", label: "Partner SOPs", eyebrow: "07", detail: "Partner processes and training.", count: 0 },
];

const resources: Resource[] = [
  ["855573003", "Introduction To Challenges", "challenge", "Start here: the big picture and the decisions that make a challenge work."],
  ["855573042", "Challenge Week At A Glance", "challenge", "See the full rhythm of a challenge before you begin planning."],
  ["855573062", "The Challenge Kick Off Call", "challenge", "Set expectations and guide your community into day one."],
  ["855573076", "Day 1 Overview", "challenge", "Open the challenge with clarity, energy, and a simple first step."],
  ["855573097", "Day 2 Overview", "challenge", "Keep momentum moving with the second day’s workflow."],
  ["855577007", "Day 3 Overview", "challenge", "Build consistency when the initial excitement settles."],
  ["855573112", "Day 4 Overview", "challenge", "Turn participation into a habit your audience can keep."],
  ["855573145", "Day 5 Overview", "challenge", "Close the week with a strong, useful final experience."],
  ["855573154", "Bonus Day Overview", "challenge", "An extra day of context, connection, and follow-through."],
  ["855573172", "Creating A Successful Challenge", "challenge", "Bring the pieces together into a repeatable event system."],
  ["855573201", "You Completed The Training", "challenge", "A final look back at the workflow and what comes next."],
  ["990690716", "Podcast Mastery", "marketing", "Use podcast conversations to build trust before the event begins."],
  ["855573250", "Social Media Marketing Mastery — Part 1", "marketing", "Create a social plan that gives your event a steady presence."],
  ["855573207", "Social Media Marketing Mastery — Part 2", "marketing", "Keep the story moving across every important moment."],
  ["923148024", "Overview Of Masterclasses", "masterclass", "Understand the role of a masterclass in your event journey."],
  ["1067920493", "Speaker Training", "bonus_training", "Give speakers the context and tools to show up ready."],
].map(([id, title, category, description], order) => ({ id, title, category: category as CategoryId, description, order }));

const playerUrl = (id: string) => `https://player.vimeo.com/video/${id}`;

function CategoryIcon({ id }: { id: CategoryId }) {
  return <span className={`rh-category-mark rh-mark-${id}`} aria-hidden="true">{id === "challenge" ? "5D" : id === "marketing" ? "M" : id === "masterclass" ? "MC" : id === "bonus_training" ? "+" : "—"}</span>;
}

export function Refined() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("challenge");
  const [selectedId, setSelectedId] = useState(resources[0].id);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const active = categories.find(category => category.id === activeCategory)!;
  const filtered = useMemo(() => resources.filter(resource => resource.category === activeCategory && resource.title.toLowerCase().includes(query.toLowerCase())), [activeCategory, query]);
  const selected = resources.find(resource => resource.id === selectedId) ?? filtered[0] ?? null;

  const chooseCategory = (id: CategoryId) => {
    setActiveCategory(id);
    setQuery("");
    const first = resources.find(resource => resource.category === id);
    if (first) setSelectedId(first.id);
  };

  return (
    <div className="rh-shell">
      <aside className={`rh-sidebar ${mobileNav ? "rh-sidebar-open" : ""}`}>
        <div className="rh-brand"><span className="rh-brand-dot" />event<span>HQ</span></div>
        <button className="rh-mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button>
        <div className="rh-side-label">Your workspace</div>
        <div className="rh-client-switch"><span className="rh-client-avatar">A</span><span><strong>Acme Events</strong><small>Client workspace</small></span><ChevronRight size={15} /></div>
        <nav className="rh-side-nav">
          <a href="#overview">Overview</a>
          <a className="rh-side-active" href="#training"><GraduationCap size={16} />Training Lab</a>
        </nav>
        <div className="rh-side-foot"><div className="rh-help-mark">?</div><span><strong>Need a hand?</strong><small>Talk to your event team</small></span></div>
      </aside>
      {mobileNav && <button className="rh-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <main className="rh-main" id="training">
        <header className="rh-topbar"><button className="rh-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="rh-breadcrumb"><span>Workspace</span><ChevronRight size={14} /><b>Training Lab</b></div><div className="rh-role">Client view</div></header>
        <div className="rh-content">
          <section className="rh-intro">
            <div><div className="rh-kicker">EVENTHQ / TRAINING LAB</div><h1>Learn the workflow.<br /><em>Run the room.</em></h1><p>A calm place to get oriented, find the right lesson, and keep your event moving forward.</p></div>
            <div className="rh-intro-note"><span className="rh-note-line" /><span>Start with <strong>Five-Day Challenges</strong><br />if you’re new here.</span></div>
          </section>
          <section className="rh-category-row" aria-label="Training categories">
            {categories.map(category => <button key={category.id} className={`rh-category ${activeCategory === category.id ? "rh-category-active" : ""} ${category.count === 0 ? "rh-category-empty" : ""}`} onClick={() => chooseCategory(category.id)}><span className="rh-cat-top"><span>{category.eyebrow}</span>{category.count > 0 && <b>{category.count}</b>}</span><CategoryIcon id={category.id} /><span className="rh-cat-copy"><strong>{category.label}</strong><small>{category.count ? `${category.count} lesson${category.count === 1 ? "" : "s"}` : "Coming soon"}</small></span>{activeCategory === category.id && <span className="rh-cat-arrow"><ArrowRight size={16} /></span>}</button>)}
          </section>
          <section className="rh-learning-grid">
            <div className="rh-lesson-panel">
              <div className="rh-section-head"><div><div className="rh-kicker">NOW BROWSING / {active.eyebrow}</div><h2>{active.label}</h2><p>{active.detail}</p></div><div className="rh-lesson-count"><b>{active.count.toString().padStart(2, "0")}</b><span>lessons</span></div></div>
              {active.count === 0 ? <div className="rh-empty"><span className="rh-empty-ring">+</span><h3>This chapter is still being prepared.</h3><p>More {active.label.toLowerCase()} resources will appear here when they’re ready.</p></div> : <><div className="rh-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a lesson" aria-label="Find a lesson" /></div><div className="rh-lesson-list">{filtered.map((resource, index) => <button key={resource.id} className={`rh-lesson ${selected?.id === resource.id ? "rh-lesson-selected" : ""}`} onClick={() => setSelectedId(resource.id)}><span className="rh-lesson-num">{String(index + 1).padStart(2, "0")}</span><span className="rh-play-dot">{selected?.id === resource.id ? <Play size={11} fill="currentColor" /> : <span />}</span><span className="rh-lesson-name">{resource.title}</span>{selected?.id === resource.id && <Check size={15} className="rh-check" />}</button>)}</div></>}
            </div>
            <div className="rh-player-column">{selected ? <><div className="rh-player-card"><div className="rh-player-label"><span className="rh-live-dot" />Selected lesson</div><div className="rh-video"><iframe src={playerUrl(selected.id)} title={selected.title} loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div><div className="rh-player-meta"><div><div className="rh-kicker">LESSON {String((selected.order % 11) + 1).padStart(2, "0")}</div><h3>{selected.title}</h3><p>{selected.description}</p></div><div className="rh-duration"><Clock3 size={14} /> Watch at your pace</div></div></div><div className="rh-next"><span>UP NEXT IN {active.label.toUpperCase()}</span><strong>{filtered.find(resource => resource.id !== selected.id)?.title ?? "More lessons coming soon"}</strong><ChevronRight size={18} /></div></> : <div className="rh-no-selection">Choose a lesson to begin.</div>}</div>
          </section>
          <footer className="rh-footer"><span>Private client workspace</span><span className="rh-footer-rule" /><span>EventHQ Training Lab</span><a href="https://eventhq.com" target="_blank" rel="noreferrer">EventHQ help center <ExternalLink size={13} /></a></footer>
        </div>
      </main>
    </div>
  );
}