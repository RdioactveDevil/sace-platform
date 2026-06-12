import React from 'react';
import { 
  Home, 
  Users, 
  FileText, 
  TrendingUp, 
  Calendar, 
  Folder, 
  BookOpen, 
  Activity,
  Plus,
  Bell,
  Search,
  MessageSquare,
  MoreVertical,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import './_warm.css';

export function WarmEditorial() {
  return (
    <div className="flex h-screen w-full bg-[#faf7f2] font-sans-body text-[#1c1410] overflow-hidden">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <div className="w-[240px] flex-shrink-0 bg-[#1c1410] text-[#faf7f2] flex flex-col justify-between shadow-xl z-10">
        <div>
          <div className="p-6 pb-8">
            <h1 className="font-serif-display text-2xl tracking-wide text-[#faf7f2]">gradefarm.</h1>
          </div>
          
          <nav className="px-3 space-y-1 text-sm">
            <NavItem icon={<Home size={18} />} label="Overview" active />
            <NavItem icon={<Users size={18} />} label="Students" />
            <NavItem icon={<FileText size={18} />} label="Assignments" badge="3" />
            <NavItem icon={<TrendingUp size={18} />} label="Progress" />
            <NavItem icon={<Calendar size={18} />} label="Sessions" />
            
            <div className="pt-6 pb-2 px-3 text-xs uppercase tracking-wider text-[#faf7f2]/50 font-medium">Resources</div>
            <NavItem icon={<Folder size={18} />} label="Library" />
            <NavItem icon={<BookOpen size={18} />} label="Classes" />
            <NavItem icon={<Activity size={18} />} label="Diagnostics" />
          </nav>
        </div>

        {/* Profile Footer */}
        <div className="p-4 m-3 mt-auto bg-[#faf7f2]/5 rounded-xl border border-[#faf7f2]/10 flex items-center gap-3 cursor-pointer hover:bg-[#faf7f2]/10 transition-colors">
          <div className="w-10 h-10 rounded-full bg-[#d97706] flex items-center justify-center text-white font-serif-display text-lg">
            S
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="font-medium text-[15px] truncate text-[#faf7f2]">Sarah Jenkins</div>
            <div className="text-xs text-[#faf7f2]/60 truncate">Chemistry Tutor</div>
          </div>
          <MoreVertical size={16} className="text-[#faf7f2]/50" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-[80px] flex-shrink-0 flex items-center justify-between px-10 border-b border-[#1c1410]/5 bg-[#faf7f2]/80 backdrop-blur-md z-10">
          <div>
            <div className="text-sm text-[#1c1410]/50 font-medium mb-1">Dashboard</div>
            <h2 className="font-serif-display text-[28px] leading-none text-[#1c1410]">Overview</h2>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-sm text-[#1c1410]/60 font-medium hidden md:block">
              Tuesday, 24 October
            </div>
            <div className="h-4 w-px bg-[#1c1410]/10 hidden md:block"></div>
            <div className="flex items-center gap-3">
              <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#1c1410]/5 text-[#1c1410]/70 transition-colors">
                <Search size={20} />
              </button>
              <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#1c1410]/5 text-[#1c1410]/70 transition-colors relative">
                <Bell size={20} />
                <span className="absolute top-2 right-2.5 w-2 h-2 bg-[#d97706] rounded-full border-2 border-[#faf7f2]"></span>
              </button>
              <button className="ml-2 bg-[#d97706] hover:bg-[#b46305] text-white px-5 py-2.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
                <Plus size={18} />
                <span>New Session</span>
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Area */}
        <main className="flex-1 overflow-y-auto px-10 py-8">
          <div className="max-w-6xl mx-auto space-y-10">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KpiCard title="Active Students" value="12" trend="+2 this month" icon={<Users size={20} className="text-[#d97706]" />} />
              <KpiCard title="Overdue Reviews" value="3" trend="Needs attention" trendAlert icon={<AlertCircle size={20} className="text-red-500" />} />
              <KpiCard title="Sessions This Week" value="8" trend="1 completed" icon={<Calendar size={20} className="text-[#1c1410]/60" />} />
              <KpiCard title="XP Earned" value="4,280" trend="Top 15% of tutors" icon={<TrendingUp size={20} className="text-emerald-600" />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              
              {/* Left Column (Main Feed) */}
              <div className="lg:col-span-2 space-y-10">
                
                {/* Upcoming Sessions */}
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-serif-display text-2xl text-[#1c1410]">Upcoming Sessions</h3>
                    <button className="text-sm font-medium text-[#d97706] hover:text-[#b46305] transition-colors">View schedule</button>
                  </div>
                  
                  <div className="space-y-4">
                    <SessionCard 
                      time="14:00" 
                      duration="60 min"
                      student="Ava Chen"
                      initial="A"
                      topic="Acid-Base Reactions"
                      type="1:1 Session"
                      color="bg-rose-100 text-rose-800"
                    />
                    <SessionCard 
                      time="16:30" 
                      duration="45 min"
                      student="Tom Reid"
                      initial="T"
                      topic="Atomic Structure"
                      type="Check-in"
                      color="bg-blue-100 text-blue-800"
                    />
                    <SessionCard 
                      time="09:00" 
                      duration="90 min"
                      student="Year 11 Cohort"
                      initial="Y11"
                      topic="Thermochemistry Review"
                      type="Group Class"
                      color="bg-emerald-100 text-emerald-800"
                      isTomorrow
                    />
                  </div>
                </section>

                {/* Recent Assignments */}
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-serif-display text-2xl text-[#1c1410]">Needs Review</h3>
                    <button className="text-sm font-medium text-[#d97706] hover:text-[#b46305] transition-colors">View all</button>
                  </div>

                  <div className="paper-tile warm-shadow p-2">
                    <AssignmentRow student="Mia Wong" initial="M" task="Titration Lab Report" submitted="2 hours ago" status="waiting" />
                    <AssignmentRow student="Lucas Smith" initial="L" task="Equilibrium Worksheet" submitted="5 hours ago" status="waiting" />
                    <AssignmentRow student="Ava Chen" initial="A" task="Redox Practice Test" submitted="1 day ago" status="reviewed" />
                  </div>
                </section>
              </div>

              {/* Right Column (Sidebar within main) */}
              <div className="space-y-8">
                
                {/* Quick Actions */}
                <section>
                  <h3 className="font-serif-display text-[20px] text-[#1c1410] mb-5">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <QuickAction icon={<MessageSquare size={20} />} label="Message" />
                    <QuickAction icon={<FileText size={20} />} label="Set Task" />
                    <QuickAction icon={<Activity size={20} />} label="Diagnostic" />
                    <QuickAction icon={<Folder size={20} />} label="Resources" />
                  </div>
                </section>

                {/* Tutor Notes */}
                <section className="paper-tile p-6 warm-shadow bg-[#fffdfa]">
                  <h3 className="font-serif-display text-[20px] text-[#1c1410] mb-4">Scratchpad</h3>
                  <textarea 
                    className="w-full h-40 bg-transparent border-none resize-none focus:ring-0 p-0 text-[#1c1410]/80 placeholder:text-[#1c1410]/30 text-[15px] leading-relaxed"
                    placeholder="Jot down notes for your next session..."
                    defaultValue="- Remind Ava about ICE tables&#10;- Find new worksheet for electrochemistry&#10;- Tom struggling with spectator ions"
                  ></textarea>
                  <div className="flex justify-between items-center pt-4 border-t border-[#1c1410]/5 mt-2">
                    <span className="text-xs text-[#1c1410]/40">Saved automatically</span>
                    <button className="text-sm font-medium text-[#d97706]">Expand</button>
                  </div>
                </section>

              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, badge }: { icon: React.ReactNode, label: string, active?: boolean, badge?: string }) {
  return (
    <a href="#" className={`flex items-center justify-between px-4 py-2.5 rounded-lg transition-all duration-200 group ${
      active 
        ? 'bg-[#d97706]/10 text-[#d97706] font-medium' 
        : 'text-[#faf7f2]/70 hover:bg-[#faf7f2]/5 hover:text-[#faf7f2]'
    }`}>
      <div className="flex items-center gap-3">
        <span className={`${active ? 'text-[#d97706]' : 'text-[#faf7f2]/50 group-hover:text-[#faf7f2]/80'}`}>
          {icon}
        </span>
        <span className="text-[15px]">{label}</span>
      </div>
      {badge && (
        <span className="bg-[#d97706] text-white text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
          {badge}
        </span>
      )}
    </a>
  );
}

function KpiCard({ title, value, trend, icon, trendAlert }: { title: string, value: string, trend: string, icon: React.ReactNode, trendAlert?: boolean }) {
  return (
    <div className="paper-tile p-6 warm-shadow group hover:warm-shadow-sm transition-shadow duration-300">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2.5 bg-[#faf7f2] rounded-xl group-hover:scale-105 transition-transform duration-300">
          {icon}
        </div>
      </div>
      <div className="text-3xl font-serif-display text-[#1c1410] mb-1">{value}</div>
      <div className="flex justify-between items-end">
        <div className="text-[15px] font-medium text-[#1c1410]/70">{title}</div>
      </div>
      <div className={`text-xs mt-3 font-medium ${trendAlert ? 'text-red-600' : 'text-[#1c1410]/40'}`}>
        {trend}
      </div>
    </div>
  );
}

function SessionCard({ time, duration, student, initial, topic, type, color, isTomorrow }: any) {
  return (
    <div className="group paper-tile p-5 flex items-center gap-6 warm-shadow-sm hover:warm-shadow transition-shadow cursor-pointer relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#d97706] opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      <div className="w-24 flex-shrink-0 text-center">
        {isTomorrow && <div className="text-[11px] font-bold uppercase tracking-wider text-[#1c1410]/40 mb-1">Tomorrow</div>}
        <div className="text-2xl font-serif-display text-[#1c1410] leading-none mb-1">{time}</div>
        <div className="text-xs font-medium text-[#1c1410]/50 flex items-center justify-center gap-1">
          <Clock size={12} /> {duration}
        </div>
      </div>
      
      <div className="w-px h-12 bg-[#1c1410]/5"></div>
      
      <div className="flex-1 min-w-0 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-[#1c1410]/5 flex items-center justify-center text-[#1c1410] font-serif-display text-xl flex-shrink-0 border border-[#1c1410]/10">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-[#1c1410] text-[16px] truncate">{student}</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${color}`}>
              {type}
            </span>
          </div>
          <div className="text-[14px] text-[#1c1410]/60 truncate">{topic}</div>
        </div>
      </div>
      
      <div className="flex-shrink-0 pr-2">
        <button className="w-10 h-10 rounded-full border border-[#1c1410]/10 flex items-center justify-center text-[#1c1410]/40 hover:bg-[#1c1410]/5 hover:text-[#1c1410] transition-colors">
          <MoreVertical size={18} />
        </button>
      </div>
    </div>
  );
}

function AssignmentRow({ student, initial, task, submitted, status }: any) {
  const isReviewed = status === 'reviewed';
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-[#faf7f2]/50 transition-colors cursor-pointer group">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-serif-display flex-shrink-0 ${isReviewed ? 'bg-[#1c1410]/5 text-[#1c1410]/50' : 'bg-[#d97706]/10 text-[#d97706]'}`}>
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[15px] text-[#1c1410] truncate mb-0.5">{task}</div>
        <div className="text-[13px] text-[#1c1410]/60 flex items-center gap-2">
          <span>{student}</span>
          <span className="w-1 h-1 rounded-full bg-[#1c1410]/20"></span>
          <span>{submitted}</span>
        </div>
      </div>
      <div className="flex-shrink-0 px-2">
        {isReviewed ? (
          <div className="flex items-center gap-1.5 text-emerald-600 text-[13px] font-medium">
            <CheckCircle2 size={16} />
            <span>Done</span>
          </div>
        ) : (
          <button className="bg-[#1c1410] hover:bg-[#1c1410]/90 text-white px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors">
            Review
          </button>
        )}
      </div>
    </div>
  );
}

function QuickAction({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <button className="paper-tile p-4 warm-shadow-sm hover:warm-shadow flex flex-col items-center justify-center gap-3 transition-all duration-300 group hover:-translate-y-0.5">
      <div className="w-12 h-12 rounded-full bg-[#faf7f2] text-[#1c1410]/70 flex items-center justify-center group-hover:bg-[#d97706]/10 group-hover:text-[#d97706] transition-colors">
        {icon}
      </div>
      <span className="text-[14px] font-medium text-[#1c1410]/80 group-hover:text-[#1c1410]">{label}</span>
    </button>
  );
}
