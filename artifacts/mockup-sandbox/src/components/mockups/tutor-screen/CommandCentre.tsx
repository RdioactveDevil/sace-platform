import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  ClipboardList, 
  TrendingUp, 
  Video, 
  FolderOpen, 
  MonitorPlay, 
  Stethoscope,
  Search,
  Bell,
  Plus,
  Settings,
  MoreVertical,
  Clock,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Zap,
  BarChart
} from 'lucide-react';
import './_tutor.css';

export function CommandCentre() {
  const [activeTab, setActiveTab] = useState('Overview');

  const navGroups = [
    {
      label: 'CORE',
      items: [
        { name: 'Overview', icon: <LayoutDashboard size={16} /> },
        { name: 'Students', icon: <Users size={16} /> },
        { name: 'Assignments', icon: <ClipboardList size={16} /> },
        { name: 'Progress', icon: <TrendingUp size={16} /> },
      ]
    },
    {
      label: 'WORKSPACE',
      items: [
        { name: 'Sessions', icon: <Video size={16} /> },
        { name: 'Resources', icon: <FolderOpen size={16} /> },
        { name: 'Classes', icon: <MonitorPlay size={16} /> },
        { name: 'Diagnostics', icon: <Stethoscope size={16} /> },
      ]
    }
  ];

  const kpis = [
    { label: 'Active Students', value: '12', trend: '+2 this week', icon: <Users size={18} className="text-[#f1be43]" /> },
    { label: 'Overdue Tasks', value: '3', trend: 'Requires attention', icon: <AlertCircle size={18} className="text-red-400" /> },
    { label: 'Upcoming Sessions', value: '8', trend: 'Next 7 days', icon: <Video size={18} className="text-[#f1be43]" /> },
    { label: 'Total XP Earned', value: '4,280', trend: 'Top 15% of tutors', icon: <Zap size={18} className="text-[#f1be43]" /> },
  ];

  const upcomingSessions = [
    { student: 'Ava Chen', topic: 'Acid-Base Reactions', time: '14:00 - 15:00', date: 'Today' },
    { student: 'Tom Reid', topic: 'Atomic Structure', time: '16:30 - 17:30', date: 'Today' },
    { student: 'Sarah Jenkins', topic: 'Organic Chemistry Intro', time: '09:00 - 10:00', date: 'Tomorrow' },
  ];

  const recentAssignments = [
    { title: 'Titration Practical Report', student: 'Ava Chen', status: 'Submitted', time: '2 hours ago' },
    { title: 'Periodic Trends Quiz', student: 'Tom Reid', status: 'Overdue', time: '1 day ago' },
    { title: 'Moles Calculation Worksheet', student: 'Class 11A', status: 'Graded', time: '2 days ago' },
  ];

  return (
    <div className="tutor-dark-cockpit font-sans text-sm">
      {/* External font loading for Space Grotesk */}
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <aside className="w-[220px] h-screen flex flex-col tutor-sidebar flex-shrink-0 relative z-10">
        <div className="p-5 flex items-center gap-2 border-b border-[rgba(241,190,67,0.15)]">
          <div className="w-6 h-6 rounded bg-[#f1be43] flex items-center justify-center text-[#05061a] font-bold text-xs">
            g.
          </div>
          <span className="font-bold text-lg tracking-tight text-[#e2e8f0]">gradefarm<span className="text-[#f1be43]">.</span></span>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {navGroups.map((group, idx) => (
            <div key={idx} className="mb-6">
              <div className="px-5 mb-2 text-[10px] uppercase tracking-widest text-[#8b95a5] font-semibold opacity-70">
                {group.label}
              </div>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.name}>
                    <button
                      onClick={() => setActiveTab(item.name)}
                      className={`w-full flex items-center gap-3 px-5 py-2 text-sm tutor-nav-item ${activeTab === item.name ? 'active' : ''}`}
                    >
                      {item.icon}
                      <span className="font-medium">{item.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Profile Footer */}
        <div className="p-4 border-t border-[rgba(241,190,67,0.15)] flex items-center gap-3 bg-[rgba(0,0,0,0.2)]">
          <div className="w-8 h-8 rounded-full bg-[#f1be43] flex items-center justify-center text-[#05061a] font-bold">
            J
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-semibold text-[#e2e8f0] truncate">Dr. J. Smith</div>
            <div className="text-xs text-[#8b95a5] truncate">Chemistry Tutor</div>
          </div>
          <button className="text-[#8b95a5] hover:text-[#f1be43] transition-colors">
            <Settings size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-hidden flex flex-col relative">
        {/* Header */}
        <header className="h-16 border-b border-[rgba(241,190,67,0.15)] px-8 flex items-center justify-between flex-shrink-0 bg-[rgba(7,9,36,0.8)] backdrop-blur-sm relative z-10">
          <div className="flex items-center gap-2">
            <div className="text-[#8b95a5] flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
              <span>Command Centre</span>
              <ChevronRight size={12} />
              <span className="text-[#f1be43]">{activeTab}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b95a5]" />
              <input 
                type="text" 
                placeholder="Search command..." 
                className="bg-[rgba(255,255,255,0.03)] border border-[rgba(241,190,67,0.15)] rounded text-xs px-8 py-1.5 focus:outline-none focus:border-[#f1be43] text-[#e2e8f0] w-48 transition-colors"
              />
            </div>
            <button className="relative text-[#8b95a5] hover:text-[#f1be43] transition-colors">
              <Bell size={16} />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#f1be43] rounded-full"></span>
            </button>
            <button className="bg-[rgba(241,190,67,0.1)] hover:bg-[rgba(241,190,67,0.2)] text-[#f1be43] border border-[rgba(241,190,67,0.3)] rounded px-3 py-1.5 text-xs font-semibold flex items-center gap-2 transition-all">
              <Plus size={14} />
              <span>New Session</span>
            </button>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-8 relative z-0">
          {/* subtle background glow */}
          <div className="fixed top-20 left-[20%] w-[500px] h-[500px] bg-[#f1be43] rounded-full blur-[150px] opacity-[0.03] pointer-events-none"></div>

          <div className="max-w-6xl mx-auto space-y-8">
            {/* Header Area */}
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-3xl font-bold text-[#e2e8f0] tracking-tight mb-1">System Overview</h1>
                <p className="text-[#8b95a5] text-sm">Real-time telemetry for your tutoring workspace.</p>
              </div>
              <div className="text-right text-[#8b95a5] text-xs font-mono uppercase tracking-wider flex items-center gap-2">
                <Clock size={12} />
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} — {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
              {kpis.map((kpi, i) => (
                <div key={i} className="tutor-kpi-card p-4 rounded-lg flex flex-col justify-between h-28 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[rgba(241,190,67,0.5)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="flex justify-between items-start">
                    <span className="text-xs uppercase tracking-widest text-[#8b95a5] font-semibold">{kpi.label}</span>
                    {kpi.icon}
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-[#e2e8f0] tracking-tighter">{kpi.value}</div>
                    <div className="text-xs text-[#8b95a5] mt-1 flex items-center gap-1">
                      <span className={kpi.label === 'Overdue Tasks' ? 'text-red-400' : 'text-[#f1be43]'}>■</span> {kpi.trend}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* Upcoming Sessions */}
              <div className="col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-[#8b95a5] border-l-2 border-[#f1be43] pl-2">Session Manifest</h2>
                  <button className="text-xs text-[#f1be43] hover:underline">View All</button>
                </div>
                
                <div className="tutor-glass-panel rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[rgba(241,190,67,0.15)] bg-[rgba(0,0,0,0.2)]">
                        <th className="p-3 text-xs uppercase tracking-wider text-[#8b95a5] font-semibold">Student</th>
                        <th className="p-3 text-xs uppercase tracking-wider text-[#8b95a5] font-semibold">Topic Module</th>
                        <th className="p-3 text-xs uppercase tracking-wider text-[#8b95a5] font-semibold">Schedule</th>
                        <th className="p-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingSessions.map((session, i) => (
                        <tr key={i} className="border-b border-[rgba(241,190,67,0.05)] hover:bg-[rgba(255,255,255,0.02)] transition-colors group">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-[rgba(241,190,67,0.1)] text-[#f1be43] flex items-center justify-center text-xs font-bold">
                                {session.student.charAt(0)}
                              </div>
                              <span className="font-medium text-[#e2e8f0]">{session.student}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-xs text-[#e2e8f0]">
                              {session.topic}
                            </span>
                          </td>
                          <td className="p-3 text-xs">
                            <div className="text-[#e2e8f0]">{session.time}</div>
                            <div className="text-[#8b95a5]">{session.date}</div>
                          </td>
                          <td className="p-3 text-right">
                            <button className="opacity-0 group-hover:opacity-100 bg-[#f1be43] text-[#05061a] px-3 py-1 rounded text-xs font-semibold transition-all hover:bg-[#ffce54]">
                              Initialize
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Assignment Feed */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-[#8b95a5] border-l-2 border-[#f1be43] pl-2">Task Activity</h2>
                </div>
                
                <div className="tutor-glass-panel rounded-lg p-4 space-y-4">
                  {recentAssignments.map((assignment, i) => (
                    <div key={i} className="flex gap-3 relative pb-4 last:pb-0">
                      {i !== recentAssignments.length - 1 && (
                        <div className="absolute left-2.5 top-6 bottom-0 w-[1px] bg-[rgba(241,190,67,0.15)]"></div>
                      )}
                      <div className="mt-0.5">
                        {assignment.status === 'Submitted' && <div className="w-5 h-5 rounded-full bg-[rgba(241,190,67,0.2)] text-[#f1be43] flex items-center justify-center border border-[#f1be43]"><CheckCircle2 size={10} /></div>}
                        {assignment.status === 'Overdue' && <div className="w-5 h-5 rounded-full bg-[rgba(248,113,113,0.2)] text-red-400 flex items-center justify-center border border-red-400"><AlertCircle size={10} /></div>}
                        {assignment.status === 'Graded' && <div className="w-5 h-5 rounded-full bg-[rgba(255,255,255,0.1)] text-[#8b95a5] flex items-center justify-center border border-[rgba(255,255,255,0.2)]"><ClipboardList size={10} /></div>}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-[#e2e8f0] leading-tight">{assignment.title}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-[#8b95a5]">{assignment.student}</span>
                          <span className="text-[10px] text-[#8b95a5] uppercase tracking-wider font-mono">{assignment.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <button className="w-full py-2 mt-2 text-xs font-semibold text-[#f1be43] border border-[rgba(241,190,67,0.3)] rounded hover:bg-[rgba(241,190,67,0.1)] transition-colors">
                    View Complete Log
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="pt-4 border-t border-[rgba(241,190,67,0.15)]">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#8b95a5] mb-4">Quick Protocols</h2>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { icon: <Plus size={18} />, label: 'Assign Quiz' },
                  { icon: <Video size={18} />, label: 'Ad-hoc Room' },
                  { icon: <Users size={18} />, label: 'Invite Student' },
                  { icon: <FolderOpen size={18} />, label: 'Upload Resource' },
                  { icon: <BarChart size={18} />, label: 'Run Report' },
                ].map((action, i) => (
                  <button key={i} className="tutor-glass-panel rounded border border-[rgba(255,255,255,0.05)] p-3 flex flex-col items-center justify-center gap-2 hover:bg-[rgba(241,190,67,0.05)] hover:border-[rgba(241,190,67,0.3)] transition-all group">
                    <div className="text-[#8b95a5] group-hover:text-[#f1be43] transition-colors">{action.icon}</div>
                    <span className="text-xs font-medium text-[#e2e8f0]">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
