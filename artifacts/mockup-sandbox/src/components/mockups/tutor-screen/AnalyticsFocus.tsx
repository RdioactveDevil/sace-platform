import React from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  TrendingUp,
  Video,
  BookOpen,
  MonitorPlay,
  Activity,
  Bell,
  Search,
  Plus,
  ChevronDown,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  MoreVertical,
} from "lucide-react";

export function AnalyticsFocus() {
  return (
    <div className="flex h-screen w-full bg-white font-inter text-slate-900 overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .font-inter { font-family: 'Inter', sans-serif; }
        .shadow-glass { box-shadow: 0 4px 24px -4px rgba(0, 0, 0, 0.03), 0 0 1px rgba(0,0,0,0.1); }
        .bg-gradient-accent { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); }
        .text-gradient-accent { 
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        /* Custom scrollbar */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>

      {/* Sidebar */}
      <aside className="w-[220px] shrink-0 bg-[#f8f9fc] border-r border-[#e2e6ed] flex flex-col justify-between z-10">
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-6">
            <span className="text-xl font-bold tracking-tight text-slate-900">
              gradefarm.
            </span>
          </div>

          {/* Navigation */}
          <nav className="px-3 py-4 space-y-8">
            <div>
              <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Main
              </p>
              <div className="space-y-0.5">
                <NavItem icon={<LayoutDashboard size={16} />} label="Overview" active />
                <NavItem icon={<Users size={16} />} label="Students" />
                <NavItem icon={<FileText size={16} />} label="Assignments" />
                <NavItem icon={<TrendingUp size={16} />} label="Progress" />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Manage
              </p>
              <div className="space-y-0.5">
                <NavItem icon={<Video size={16} />} label="Sessions" />
                <NavItem icon={<BookOpen size={16} />} label="Resources" />
                <NavItem icon={<MonitorPlay size={16} />} label="Classes" />
                <NavItem icon={<Activity size={16} />} label="Diagnostics" />
              </div>
            </div>
          </nav>
        </div>

        {/* Profile Footer */}
        <div className="p-4 border-t border-[#e2e6ed]">
          <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-white transition-colors border border-transparent hover:border-slate-200 shadow-sm hover:shadow-glass">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm shrink-0">
              EK
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                Emma Kline
              </p>
              <p className="text-xs text-slate-500 truncate">Tutor</p>
            </div>
            <MoreVertical size={16} className="text-slate-400 shrink-0" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Header */}
        <header className="h-16 shrink-0 border-b border-[#e2e6ed] px-8 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-sm z-10">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-slate-900">Overview</h1>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-500">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search students, topics..."
                className="pl-9 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all w-64"
              />
            </div>
            <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 border-2 border-white"></span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-md transition-colors">
              <Plus size={16} />
              <span>New Assignment</span>
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Top Section: KPIs */}
            <div className="grid grid-cols-4 gap-4">
              <KpiCard
                title="Active Students"
                value="12"
                trend="+2 this month"
                trendUp={true}
                sparkline={
                  <svg viewBox="0 0 100 30" className="w-full h-8 stroke-indigo-500 fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M0,25 L15,20 L30,22 L45,15 L60,18 L75,10 L90,12 L100,5" />
                    <path d="M0,25 L15,20 L30,22 L45,15 L60,18 L75,10 L90,12 L100,5 L100,30 L0,30 Z" className="fill-indigo-50 stroke-none" />
                  </svg>
                }
              />
              <KpiCard
                title="Overdue Tasks"
                value="3"
                trend="Action required"
                trendUp={false}
                alert={true}
                sparkline={
                  <svg viewBox="0 0 100 30" className="w-full h-8 stroke-amber-500 fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M0,5 L20,15 L40,10 L60,25 L80,20 L100,28" />
                    <path d="M0,5 L20,15 L40,10 L60,25 L80,20 L100,28 L100,30 L0,30 Z" className="fill-amber-50 stroke-none" />
                  </svg>
                }
              />
              <KpiCard
                title="Sessions This Week"
                value="8"
                trend="2 remaining"
                trendUp={true}
                sparkline={
                  <div className="flex items-end justify-between h-8 gap-1 pt-2 w-full">
                    {[40, 60, 30, 80, 50, 90, 70].map((h, i) => (
                      <div key={i} className="w-full bg-indigo-100 rounded-t-sm overflow-hidden flex items-end">
                        <div className="w-full bg-indigo-500 rounded-t-sm" style={{ height: `${h}%` }}></div>
                      </div>
                    ))}
                  </div>
                }
              />
              <KpiCard
                title="Class Average Accuracy"
                value="74%"
                trend="+3% vs last week"
                trendUp={true}
                sparkline={
                  <svg viewBox="0 0 100 30" className="w-full h-8 stroke-emerald-500 fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M0,20 L20,22 L40,15 L60,18 L80,8 L100,5" />
                    <path d="M0,20 L20,22 L40,15 L60,18 L80,8 L100,5 L100,30 L0,30 Z" className="fill-emerald-50 stroke-none" />
                  </svg>
                }
              />
            </div>

            {/* Quick Actions & Activity */}
            <div className="grid grid-cols-3 gap-8">
              <div className="col-span-2 space-y-8">
                {/* Upcoming Sessions */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-slate-900">
                      Upcoming Sessions
                    </h2>
                    <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">
                      View Calendar
                    </button>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-glass overflow-hidden">
                    <div className="divide-y divide-slate-100">
                      <SessionRow
                        time="10:00 AM"
                        date="Today"
                        student="Ava Chen"
                        topic="Acid-Base Reactions"
                        type="1-on-1"
                        status="starting-soon"
                      />
                      <SessionRow
                        time="2:30 PM"
                        date="Today"
                        student="Tom Reid"
                        topic="Atomic Structure"
                        type="1-on-1"
                      />
                      <SessionRow
                        time="4:00 PM"
                        date="Tomorrow"
                        student="Group A"
                        topic="Organic Chemistry Intro"
                        type="Group"
                      />
                    </div>
                  </div>
                </section>

                {/* Recent Assignments */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-slate-900">
                      Needs Review
                    </h2>
                    <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">
                      View All
                    </button>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-glass overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                      <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <div className="col-span-5">Assignment</div>
                        <div className="col-span-3">Student</div>
                        <div className="col-span-2">Submitted</div>
                        <div className="col-span-2 text-right">Action</div>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      <AssignmentRow
                        title="Titration Calculation Practice"
                        student="Ava Chen"
                        time="2 hours ago"
                        status="pending"
                      />
                      <AssignmentRow
                        title="Electron Configurations"
                        student="Tom Reid"
                        time="5 hours ago"
                        status="pending"
                      />
                      <AssignmentRow
                        title="Thermochemistry Lab Report"
                        student="Sarah Jenkins"
                        time="1 day ago"
                        status="graded"
                      />
                    </div>
                  </div>
                </section>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Cohort Performance */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-glass">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center justify-between">
                    <span>Cohort Accuracy</span>
                    <MoreVertical size={16} className="text-slate-400" />
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-slate-700">
                          Stoichiometry
                        </span>
                        <span className="text-slate-500">82%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: "82%" }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-slate-700">
                          Equilibrium
                        </span>
                        <span className="text-slate-500">68%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: "68%" }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-slate-700">
                          Redox Reactions
                        </span>
                        <span className="text-amber-600 font-medium">45%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: "45%" }}
                        />
                      </div>
                      <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                        <AlertTriangle size={12} /> Needs remediation
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick Actions Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <button className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors group">
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <FileText size={18} className="text-indigo-600" />
                    </div>
                    <span className="text-xs font-medium text-slate-700">
                      Generate Quiz
                    </span>
                  </button>
                  <button className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors group">
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Users size={18} className="text-indigo-600" />
                    </div>
                    <span className="text-xs font-medium text-slate-700">
                      Add Student
                    </span>
                  </button>
                  <button className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors group">
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Activity size={18} className="text-indigo-600" />
                    </div>
                    <span className="text-xs font-medium text-slate-700">
                      Run Diagnostic
                    </span>
                  </button>
                  <button className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors group">
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Calendar size={18} className="text-indigo-600" />
                    </div>
                    <span className="text-xs font-medium text-slate-700">
                      Schedule
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all text-sm font-medium ${
        active
          ? "bg-white text-indigo-600 shadow-sm border border-slate-200/60"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent"
      }`}
    >
      <span className={active ? "text-indigo-600" : "text-slate-400"}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function KpiCard({ title, value, trend, trendUp, alert, sparkline }: any) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-glass relative overflow-hidden group hover:border-indigo-200 transition-colors cursor-default">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-2xl font-bold text-slate-900 tracking-tight">
          {value}
        </span>
      </div>
      
      {/* Visual area */}
      <div className="mb-4">
        {sparkline}
      </div>

      <div className="flex items-center text-xs font-medium">
        {alert ? (
          <span className="text-amber-600 flex items-center gap-1">
            <AlertTriangle size={14} />
            {trend}
          </span>
        ) : (
          <span
            className={
              trendUp ? "text-emerald-600 flex items-center gap-1" : "text-slate-500 flex items-center gap-1"
            }
          >
            {trendUp && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
                <polyline points="16 7 22 7 22 13"></polyline>
              </svg>
            )}
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}

function SessionRow({ time, date, student, topic, type, status }: any) {
  return (
    <div className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors group">
      <div className="w-16 shrink-0 text-center">
        <div className="text-sm font-bold text-slate-900">{time}</div>
        <div className="text-xs text-slate-500">{date}</div>
      </div>
      
      <div className="w-px h-8 bg-slate-200 mx-2"></div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-slate-900 truncate">
            {topic}
          </span>
          {status === "starting-soon" && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Starting soon
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Users size={12} className="text-slate-400" />
            {student}
          </span>
          <span className="flex items-center gap-1">
            <Video size={12} className="text-slate-400" />
            {type}
          </span>
        </div>
      </div>

      <div className="shrink-0">
        {status === "starting-soon" ? (
          <button className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors">
            Join Call
          </button>
        ) : (
          <button className="px-4 py-1.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-md transition-colors">
            Details
          </button>
        )}
      </div>
    </div>
  );
}

function AssignmentRow({ title, student, time, status }: any) {
  return (
    <div className="p-4 grid grid-cols-12 gap-4 items-center hover:bg-slate-50 transition-colors">
      <div className="col-span-5 flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
          <FileText size={16} />
        </div>
        <p className="text-sm font-medium text-slate-900 truncate">{title}</p>
      </div>
      
      <div className="col-span-3">
        <p className="text-sm text-slate-600 truncate">{student}</p>
      </div>
      
      <div className="col-span-2">
        <p className="text-xs text-slate-500">{time}</p>
      </div>
      
      <div className="col-span-2 text-right">
        {status === 'pending' ? (
          <button className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            Review
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
            <CheckCircle2 size={14} />
            Graded
          </span>
        )}
      </div>
    </div>
  );
}
