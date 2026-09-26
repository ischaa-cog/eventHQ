import { Lock, TrendingUp, BarChart2, DollarSign, GraduationCap, Shield, Hexagon } from "lucide-react";
import { motion, MotionConfig } from "framer-motion";

export default function Landing() {
  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-[#07111f] text-white overflow-x-hidden selection:bg-[#55d6ff] selection:text-[#07111f]">
      {/* Nav */}
      <motion.nav initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="hidden lg:flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/10 bg-[#07111f]/70 backdrop-blur-xl">
        <div className="flex items-center">
          <img src="/logo.png" alt="EventHQ" className="h-8 w-auto" />
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-white/40">
          <span className="h-px w-8 bg-[#55d6ff]/60" />
          Private client workspace
        </div>
        <motion.a
          href="/client-login"
          data-testid="button-login"
          whileHover={{ y: -2, backgroundColor: "rgba(85,214,255,.16)" }}
          whileTap={{ scale: .97 }}
          className="hidden lg:flex items-center gap-2 text-sm font-semibold text-[#07111f] bg-[#55d6ff] rounded-full px-5 py-2.5 shadow-[0_8px_30px_rgba(85,214,255,.18)]"
        >
          <Lock className="h-3.5 w-3.5" />
          Client Login
        </motion.a>
      </motion.nav>
      {/* Hero */}
      <div className="relative pt-10 lg:pt-24 pb-0 overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "72px 72px", maskImage: "linear-gradient(to bottom, black, transparent 80%)" }} />
        {/* Blue glow blob */}
        <div
          className="absolute -right-40 top-16 w-[760px] h-[760px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(85,214,255,0.24) 0%, rgba(56,182,255,0.07) 43%, transparent 70%)",
          }}
        />
        <div className="absolute left-[8%] top-36 h-2 w-2 rounded-full bg-[#f6c978] shadow-[0_0_28px_8px_rgba(246,201,120,.18)]" />
        <div className="relative z-10 max-w-6xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-10 lg:gap-12">

        {/* Left copy */}
        <motion.div initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.55, delay: 0.08 }} className="w-full lg:w-[420px] flex-shrink-0">
          <div className="flex items-center gap-3 mb-5 justify-center lg:justify-start">
            <span className="h-2 w-2 rounded-full bg-[#f6c978]" />
            <p className="text-[11px] font-semibold tracking-[0.24em] text-[#55d6ff] uppercase">Welcome to the ultimate</p>
          </div>
          <div className="mb-6">
            <img src="/logo.png" alt="EventHQ" className="h-20 md:h-28 w-auto mx-auto lg:mx-0" />
          </div>
          {/* Mobile-only login button */}
          <div className="flex lg:hidden justify-center mb-6">
            <a
              href="/client-login"
              data-testid="button-login-mobile"
              className="flex items-center gap-2 text-sm font-semibold text-[#07111f] bg-[#55d6ff] rounded-full px-5 py-2.5 shadow-[0_8px_30px_rgba(85,214,255,.18)]"
            >
              <Lock className="h-3.5 w-3.5" />
              Client Login
            </a>
          </div>
          <div className="w-16 h-1 bg-[#55d6ff] mb-7 rounded-full" />
          <p className="text-[2.1rem] md:text-[3.25rem] font-semibold text-white leading-[1.02] tracking-[-0.045em] mb-6 text-balance">
            The all-in-one operating system<br className="hidden md:block" /> for virtual events and digital marketing.
          </p>
          <p className="text-[#b4c5d4] text-base md:text-[17px] leading-relaxed mb-10 max-w-md">
            Plan smarter. Market stronger. Track everything.<br />
            EventHQ is your central hub for projections, performance, training, and growth.
          </p>

          {/* Private badge */}
          <div className="inline-flex items-start gap-3 bg-[#102238]/80 border border-[#55d6ff]/20 rounded-2xl px-4 py-3.5 shadow-[0_16px_50px_rgba(0,0,0,.18)]">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-[#38B6FF]/15 border border-[#38B6FF]/30 flex items-center justify-center">
              <Lock className="h-3.5 w-3.5 text-[#38B6FF]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#38B6FF]">A private platform for our clients.</p>
              <p className="text-xs text-gray-400">Not available to the public.</p>
            </div>
          </div>
        </motion.div>

        {/* Dashboard mockup */}
        <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} whileHover={{ y: -6 }} transition={{ duration: 0.65, delay: 0.16, ease: [0.22, 1, 0.36, 1] }} className="relative z-10 flex-1 flex justify-center lg:justify-end lg:pr-0 w-full max-w-2xl lg:max-w-none">
          <div className="absolute -inset-4 rounded-[2rem] border border-[#55d6ff]/10 rotate-[2deg] pointer-events-none" />
          <div
            className="w-full max-w-[620px] rounded-[1.35rem] border border-[#8ae5ff]/25 overflow-hidden shadow-2xl ring-1 ring-black/30"
            style={{
              background: "linear-gradient(135deg, #102238 0%, #091522 100%)",
              boxShadow: "0 0 100px rgba(56,182,255,0.16), 0 30px 70px rgba(0,0,0,0.52)",
            }}
          >
            {/* Mockup chrome bar */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-white/[0.03]">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              <div className="ml-3 text-xs text-gray-500">EventHQ — Dashboard</div>
            </div>

            {/* Mockup inner layout */}
            <div className="flex" style={{ minHeight: 360 }}>
              {/* Sidebar */}
              <div className="w-36 flex-shrink-0 border-r border-white/5 bg-[#070e1c] px-3 py-4 hidden sm:flex flex-col gap-1">
                <div className="flex items-center gap-2 px-2 mb-4">
                  <Hexagon className="h-4 w-4 text-[#38B6FF]" strokeWidth={1.5} />
                  <span className="text-sm font-bold">Event<span className="text-[#38B6FF]">HQ</span></span>
                </div>
                {["Dashboard","Projections","Events","Stats & Reports","Revenue","Marketing","Training","Resources","Settings"].map((item, i) => (
                  <div
                    key={item}
                    className={`text-[10px] px-2 py-1.5 rounded-md cursor-default flex items-center gap-1.5 ${
                      i === 0
                        ? "bg-[#38B6FF]/15 text-[#38B6FF]"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <div className={`w-1 h-1 rounded-full ${i === 0 ? "bg-[#38B6FF]" : "bg-gray-600"}`} />
                    {item}
                  </div>
                ))}
                <div className="mt-auto flex items-center gap-2 px-2 pt-4 border-t border-white/5">
                  <div className="w-5 h-5 rounded-full bg-[#38B6FF]/30 flex items-center justify-center text-[8px] text-[#38B6FF] font-bold">CW</div>
                  <div>
                    <p className="text-[8px] text-white font-medium">Client Workspace</p>
                    <p className="text-[7px] text-gray-500">Client Portal</p>
                  </div>
                </div>
              </div>

              {/* Main content */}
              <div className="flex-1 p-4 overflow-hidden">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[11px] text-gray-400">Dashboard</p>
                    <p className="text-sm font-semibold">Welcome back, <span className="text-[#38B6FF]">Client Workspace</span></p>
                    <p className="text-[9px] text-gray-500">Here's what's happening with your events.</p>
                  </div>
                  <div className="text-[9px] text-gray-400 bg-white/5 rounded px-2 py-1 border border-white/10">
                    May 12 – Jun 11, 2024 ▾
                  </div>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { label: "Total Revenue", val: "$1.24M", delta: "+18.6%", sub: "vs Apr 12 – May 11" },
                    { label: "Tickets Sold", val: "4,782", delta: "+12.4%", sub: "vs Apr 12 – May 11" },
                    { label: "Events", val: "12", delta: "+20%", sub: "vs Apr 12 – May 11" },
                    { label: "Net Profit", val: "$432K", delta: "+15.3%", sub: "vs Apr 12 – May 11" },
                  ].map((kpi) => (
                    <div key={kpi.label} className="bg-white/[0.04] border border-white/5 rounded-lg p-2">
                      <p className="text-[8px] text-gray-500 mb-1">{kpi.label}</p>
                      <p className="text-xs font-bold text-white">{kpi.val}</p>
                      <p className="text-[8px] text-green-400">{kpi.delta}</p>
                      <p className="text-[7px] text-gray-600">{kpi.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Chart area + pie */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-white/[0.04] border border-white/5 rounded-lg p-2">
                    <div className="flex justify-between mb-1">
                      <p className="text-[8px] text-gray-400 font-medium">Revenue Trend</p>
                      <p className="text-[7px] text-gray-500">This Year ▾</p>
                    </div>
                    <div className="h-14 flex items-end gap-0.5">
                      {[30, 45, 35, 55, 70, 65, 80, 75, 90, 85, 95, 100].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm"
                          style={{
                            height: `${h}%`,
                            background: i > 8
                              ? "linear-gradient(to top, #38B6FF, #38B6FF80)"
                              : "rgba(56,182,255,0.2)",
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1">
                      {["Jan","Feb","Mar","Apr","May","Jun"].map(m => (
                        <span key={m} className="text-[7px] text-gray-600">{m}</span>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/[0.04] border border-white/5 rounded-lg p-2">
                    <p className="text-[8px] text-gray-400 font-medium mb-2">Revenue by Event Type</p>
                    <div className="flex items-center gap-2">
                      <div className="relative w-12 h-12 flex-shrink-0">
                        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#1e293b" strokeWidth="4" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#38B6FF" strokeWidth="4"
                            strokeDasharray="39.6 48" strokeDashoffset="0" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#60a5fa" strokeWidth="4"
                            strokeDasharray="24 63.6" strokeDashoffset="-39.6" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#3b82f6" strokeWidth="4"
                            strokeDasharray="14.1 73.5" strokeDashoffset="-63.6" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#1d4ed8" strokeWidth="4"
                            strokeDasharray="9.9 77.7" strokeDashoffset="-77.7" />
                        </svg>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {[
                          { label: "Conference", pct: "45%", color: "bg-[#38B6FF]" },
                          { label: "Seminar", pct: "25%", color: "bg-blue-400" },
                          { label: "Workshop", pct: "15%", color: "bg-blue-500" },
                          { label: "Virtual", pct: "15%", color: "bg-blue-700" },
                        ].map(r => (
                          <div key={r.label} className="flex items-center gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${r.color}`} />
                            <span className="text-[7px] text-gray-400">{r.label}</span>
                            <span className="text-[7px] text-gray-500 ml-auto">{r.pct}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Events + Activity */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/[0.04] border border-white/5 rounded-lg p-2">
                    <p className="text-[8px] text-gray-400 font-medium mb-2">Upcoming Events</p>
                    {[
                      { name: "Elevate Conference 2024", date: "Jun 20-22, 2024", att: "2,350 Attending" },
                      { name: "Virtual Summit", date: "Jul 15, 2024", att: "1,120 Attending" },
                    ].map(ev => (
                      <div key={ev.name} className="flex items-center gap-1.5 mb-1.5">
                        <div className="w-3 h-3 rounded bg-[#38B6FF]/20 flex items-center justify-center flex-shrink-0">
                          <div className="w-1.5 h-1.5 bg-[#38B6FF] rounded-sm" />
                        </div>
                        <div>
                          <p className="text-[8px] text-white font-medium">{ev.name}</p>
                          <p className="text-[7px] text-gray-500">{ev.date} · {ev.att}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white/[0.04] border border-white/5 rounded-lg p-2">
                    <p className="text-[8px] text-gray-400 font-medium mb-2">Recent Activity</p>
                    {[
                      { action: "New projection created", sub: "Elevate Conference 2024", time: "2h ago" },
                      { action: "Campaign launched", sub: "Virtual Summit Email Blast", time: "5h ago" },
                      { action: "Training completed", sub: "Advanced Event Marketing", time: "1d ago" },
                    ].map(a => (
                      <div key={a.action} className="flex items-start gap-1.5 mb-1.5">
                        <div className="w-3 h-3 rounded bg-[#38B6FF]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <div className="w-1 h-1 bg-[#38B6FF] rounded-full" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[7.5px] text-white font-medium truncate">{a.action}</p>
                          <p className="text-[7px] text-gray-500 truncate">{a.sub}</p>
                        </div>
                        <p className="text-[7px] text-gray-600 flex-shrink-0">{a.time}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
        </div>
      </div>
      {/* Features strip */}
      <div className="px-6 md:px-12 pt-20 pb-16 border-t border-white/10 mt-20 bg-[#091827]/65">
        <div className="max-w-6xl mx-auto mb-10 flex items-end justify-between gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#55d6ff] mb-3">The workspace, in focus</p>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.035em] text-white">Everything in one clear view.</h2>
          </div>
          <span className="hidden sm:block text-xs text-white/35 max-w-[180px] leading-relaxed text-right">Built for the pace of event marketing.</span>
        </div>
        <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-10">
          {[
            {
              icon: <TrendingUp className="h-7 w-7 text-[#38B6FF]" />,
              title: "Powerful Projections",
              desc: "Build, adjust, and share event projections with confidence.",
            },
            {
              icon: <BarChart2 className="h-7 w-7 text-[#38B6FF]" />,
              title: "Real-Time Stats",
              desc: "Track performance and make data-driven decisions.",
            },
            {
              icon: <DollarSign className="h-7 w-7 text-[#38B6FF]" />,
              title: "Revenue Insights",
              desc: "Visualize trends and grow your bottom line.",
            },
            {
              icon: <GraduationCap className="h-7 w-7 text-[#38B6FF]" />,
              title: "Training & Resources",
              desc: "Level up your team with expert training on marketing and virtual events.",
            },
            {
              icon: <Shield className="h-7 w-7 text-[#38B6FF]" />,
              title: "Secure & Private",
              desc: "EventHQ is a proprietary platform, only for our clients.",
            },
          ].map((feat) => (
            <motion.div key={feat.title} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.3 }} className="flex flex-col gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#38B6FF]/10 border border-[#38B6FF]/20 flex items-center justify-center">
                {feat.icon}
              </div>
              <h3 className="text-sm font-semibold text-white">{feat.title}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{feat.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
      {/* Footer tagline */}
      <div className="border-t border-white/5 py-6 text-center">
        <p className="text-xs tracking-[0.25em] uppercase text-gray-500">
          Built for event professionals.{" "}
          <span className="text-[#38B6FF]">Designed for results.</span>
        </p>
      </div>
    </div>
    </MotionConfig>
  );
}
