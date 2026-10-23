import { ReactNode, useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface LayoutProps {
  children: ReactNode
}

// ── Color schemes for sidebar items ──────────────────────────────────
// iconBgIdle: always-on soft background; iconTextIdle: always-on icon tint
const menuColors = {
  dashboard: { bg: 'bg-blue-50', text: 'text-blue-700', iconBg: 'bg-blue-100', iconBgIdle: 'bg-blue-50', iconTextIdle: 'text-blue-500', activeBg: 'bg-blue-50', hoverBg: 'hover:bg-blue-50/60' },
  employees: { bg: 'bg-emerald-50', text: 'text-emerald-700', iconBg: 'bg-emerald-100', iconBgIdle: 'bg-emerald-50', iconTextIdle: 'text-emerald-500', activeBg: 'bg-emerald-50', hoverBg: 'hover:bg-emerald-50/60' },
  attendance: { bg: 'bg-amber-50', text: 'text-amber-700', iconBg: 'bg-amber-100', iconBgIdle: 'bg-amber-50', iconTextIdle: 'text-amber-500', activeBg: 'bg-amber-50', hoverBg: 'hover:bg-amber-50/60' },
  leave: { bg: 'bg-rose-50', text: 'text-rose-700', iconBg: 'bg-rose-100', iconBgIdle: 'bg-rose-50', iconTextIdle: 'text-rose-500', activeBg: 'bg-rose-50', hoverBg: 'hover:bg-rose-50/60' },
  payroll: { bg: 'bg-violet-50', text: 'text-violet-700', iconBg: 'bg-violet-100', iconBgIdle: 'bg-violet-50', iconTextIdle: 'text-violet-500', activeBg: 'bg-violet-50', hoverBg: 'hover:bg-violet-50/60' },
  orgStructure: { bg: 'bg-cyan-50', text: 'text-cyan-700', iconBg: 'bg-cyan-100', iconBgIdle: 'bg-cyan-50', iconTextIdle: 'text-cyan-500', activeBg: 'bg-cyan-50', hoverBg: 'hover:bg-cyan-50/60' },
  onboarding: { bg: 'bg-indigo-50', text: 'text-indigo-700', iconBg: 'bg-indigo-100', iconBgIdle: 'bg-indigo-50', iconTextIdle: 'text-indigo-500', activeBg: 'bg-indigo-50', hoverBg: 'hover:bg-indigo-50/60' },
  hrAnalytics: { bg: 'bg-pink-50', text: 'text-pink-700', iconBg: 'bg-pink-100', iconBgIdle: 'bg-pink-50', iconTextIdle: 'text-pink-500', activeBg: 'bg-pink-50', hoverBg: 'hover:bg-pink-50/60' },
  admin: { bg: 'bg-slate-50', text: 'text-slate-700', iconBg: 'bg-slate-100', iconBgIdle: 'bg-slate-50', iconTextIdle: 'text-slate-500', activeBg: 'bg-slate-50', hoverBg: 'hover:bg-slate-50/60' },
}

// ── SVG Icon Components (Heroicons 24 outline) ──────────────────────

const icons: Record<string, JSX.Element> = {
  dashboard: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>,
  users: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
  clock: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  calendar: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  currency: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  building: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>,
  clipboard: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>,
  chart: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  gear: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  // Submenu icons
  home: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
  dtr: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>,
  overtime: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  shift: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  schedule: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  geo: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
  holiday: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>,
  device: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>,
  leaveCalendar: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  leaveType: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>,
  approval: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  yearEnd: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  periods: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" /></svg>,
  loan: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>,
  pera: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  thMonth: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  govReport: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  dept: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>,
  position: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg>,
  onboard: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>,
  offboard: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>,
  template: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  tenant: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>,
  user: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
  role: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
  table: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5" /></svg>,
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: 'dashboard', colorKey: 'dashboard' },
  { name: 'Employees', href: '/employees', icon: 'users', colorKey: 'employees' },
  { name: 'Attendance', href: '/attendance', icon: 'clock', colorKey: 'attendance', children: [
    { name: 'Dashboard', href: '/attendance', icon: 'home' },
    { name: 'DTR', href: '/attendance/dtr', icon: 'dtr' },
    { name: 'Overtime', href: '/attendance/overtime', icon: 'overtime' },
    { name: 'Shifts', href: '/attendance/shifts', icon: 'shift' },
    { name: 'Schedules', href: '/attendance/schedules', icon: 'schedule' },
    { name: 'Geofences', href: '/attendance/geofences', icon: 'geo' },
    { name: 'Holidays', href: '/attendance/holidays', icon: 'holiday' },
    { name: 'Devices', href: '/attendance/devices', icon: 'device' },
  ]},
  { name: 'Leave', href: '/leave', icon: 'calendar', colorKey: 'leave', children: [
    { name: 'Dashboard', href: '/leave', icon: 'home' },
    { name: 'Calendar', href: '/leave/calendar', icon: 'leaveCalendar' },
    { name: 'Leave Types', href: '/leave/types', icon: 'leaveType' },
    { name: 'Approval Chains', href: '/leave/approval-chains', icon: 'approval' },
    { name: 'Year-End', href: '/leave/year-end', icon: 'yearEnd' },
  ]},
  { name: 'Payroll', href: '/payroll', icon: 'currency', colorKey: 'payroll', children: [
    { name: 'Periods & Runs', href: '/payroll', icon: 'periods' },
    { name: 'Loans', href: '/payroll/loans', icon: 'loan' },
    { name: 'PERA', href: '/payroll/pera', icon: 'pera' },
    { name: '13th Month', href: '/payroll/thirteenth-month', icon: 'thMonth' },
    { name: 'Gov Reports', href: '/payroll/government-reports', icon: 'govReport' },
  ]},
  { name: 'Org Structure', href: '/org-structure', icon: 'building', colorKey: 'orgStructure', children: [
    { name: 'Departments', href: '/org-structure/departments', icon: 'dept' },
    { name: 'Positions', href: '/org-structure/positions', icon: 'position' },
  ]},
  { name: 'Onboarding', href: '/onboarding', icon: 'clipboard', colorKey: 'onboarding', children: [
    { name: 'Active Onboardings', href: '/onboarding', icon: 'onboard' },
    { name: 'Templates', href: '/onboarding/templates', icon: 'template' },
    { name: 'Offboarding', href: '/onboarding/offboarding', icon: 'offboard' },
    { name: 'Offboard Templates', href: '/onboarding/offboarding/templates', icon: 'template' },
  ]},
  { name: 'HR Analytics', href: '/hr-matrix', icon: 'chart', colorKey: 'hrAnalytics', children: [
    { name: 'Due for Promotion', href: '/hr-matrix?tab=due-promotions', icon: 'home' },
    { name: 'KPI & Goals', href: '/hr-matrix?tab=kpis', icon: 'template' },
    { name: '9-Box Talent Sight', href: '/hr-matrix?tab=talent-sight', icon: 'user' },
    { name: 'Promotion Rules', href: '/hr-matrix?tab=criteria-config', icon: 'gear' },
    { name: 'Headcount & Org', href: '/hr-matrix?tab=headcount', icon: 'dept' },
  ]},
]

function SubMenuItems({ items, isExpanded, parentColorKey }: { items: { name: string; href: string; icon: string }[]; isExpanded: boolean; parentColorKey?: string }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const location = useLocation()
  const parentColors = menuColors[parentColorKey as keyof typeof menuColors] || menuColors.dashboard

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isExpanded ? contentRef.current.scrollHeight : 0)
    }
  }, [isExpanded])

  return (
    <div
      className="overflow-hidden transition-[height] duration-250 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ height: `${height}px` }}
    >
      <div ref={contentRef} className={`ml-[22px] pl-[14px] border-l-2 py-1.5 ${parentColors.iconTextIdle.replace('text-', 'border-').replace('500', '200')}`}>
        {items.map(child => {
          const currentUrl = location.pathname + location.search
          const childActive = currentUrl === child.href || (!child.href.includes('?') && (location.pathname === child.href || (child.href !== '/' && location.pathname.startsWith(child.href))))
          return (
            <Link
              key={child.name}
              to={child.href}
              className={`group/item flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] leading-none transition-all duration-150 mb-[2px] last:mb-0 ${
                childActive
                  ? `${parentColors.activeBg} ${parentColors.text}`
                  : `text-gray-500 hover:bg-gray-50 hover:text-gray-700`
              }`}
            >
              <span className={`flex items-center justify-center w-[26px] h-[26px] rounded-md transition-all duration-150 flex-shrink-0 ${
                childActive
                  ? `${parentColors.iconBg} ${parentColors.text} shadow-sm`
                  : `${parentColors.iconBgIdle} ${parentColors.iconTextIdle} group-hover/item:${parentColors.iconBg}`
              }`}>
                <span className="scale-90">
                  {icons[child.icon]}
                </span>
              </span>
              <span className={`flex-1 ${childActive ? 'font-medium' : ''}`}>{child.name}</span>
              {childActive && (
                <span className={`w-1.5 h-1.5 rounded-full ${parentColors.iconBg.replace('100', '400')}`} />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const hasPermission = (code: string) => user?.permissions?.includes(code) || false
  const hasRole = (roleName: string) => user?.roles?.includes(roleName) || false
  const isAdmin = hasPermission('user:manage') || hasPermission('role:manage') || hasPermission('tenant:manage') || hasPermission('system:manage')
  const isEss = hasRole('Employee') && !hasRole('Tenant Admin') && !hasRole('HR Admin') && !hasRole('Payroll Officer') && !hasRole('Department Manager') && !hasRole('Super Admin')

  const adminNavigation = isAdmin ? [
    { name: 'Admin', href: '/admin', icon: 'gear', colorKey: 'admin', children: [
      { name: 'Tenants', href: '/admin/tenants', icon: 'tenant', permission: 'tenant:manage' },
      { name: 'Users', href: '/admin/users', icon: 'user', permission: 'user:manage' },
      { name: 'Roles', href: '/admin/roles', icon: 'role', permission: 'role:manage' },
      { name: 'Contribution Tables', href: '/admin/contribution-tables', icon: 'table', permission: 'system:manage' },
    ].filter(item => hasPermission(item.permission))},
  ] : []

  // ESS (Employee Self-Service) users see a limited sidebar
  const essNavigation = isEss ? [
    { name: 'Dashboard', href: '/', icon: 'dashboard', colorKey: 'dashboard' },
    { name: 'My Attendance', href: '/attendance', icon: 'clock', colorKey: 'attendance', children: [
      { name: 'Clock In/Out', href: '/attendance', icon: 'home' },
      { name: 'My DTR', href: '/attendance/dtr', icon: 'dtr' },
    ]},
    { name: 'My Leave', href: '/leave', icon: 'calendar', colorKey: 'leave', children: [
      { name: 'My Leaves', href: '/leave', icon: 'home' },
      { name: 'File Leave', href: '/leave/request', icon: 'leaveCalendar' },
      { name: 'Leave Calendar', href: '/leave/calendar', icon: 'leaveCalendar' },
    ]},
    { name: 'My Payroll', href: '/payroll', icon: 'currency', colorKey: 'payroll', children: [
      { name: 'My Payslips', href: '/payroll', icon: 'periods' },
    ]},
  ] : []

  const allNavigation = isEss ? essNavigation : [...navigation, ...adminNavigation]

  const toggleExpand = (name: string) => {
    setExpandedItems(prev => ({ ...prev, [name]: !prev[name] }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-sm">
                <span className="text-white text-sm font-bold">H</span>
              </div>
              <span className="text-lg font-semibold text-gray-900 tracking-tight">HRIS Philippines</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
                <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-primary-700 text-xs font-semibold">
                    {(user?.firstName?.[0] || '').toUpperCase()}
                  </span>
                </div>
                <span className="font-medium text-gray-700">{user?.firstName}</span>
              </div>
              <button
                onClick={logout}
                aria-label="Logout"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-150 active:scale-[0.97]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="hidden md:block w-60 lg:w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-3.5rem)] sticky top-14">
          <nav className="p-3 space-y-0.5">
            {allNavigation.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/' && location.pathname.startsWith(item.href))
              const hasChildren = item.children && item.children.length > 0
              const isExpanded = expandedItems[item.name] ?? (isActive && hasChildren)
              const colors = menuColors[item.colorKey as keyof typeof menuColors] || menuColors.dashboard

              if (hasChildren) {
                return (
                  <div key={item.name}>
                    <button
                      onClick={() => toggleExpand(item.name)}
                      className={`w-full group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                        isActive
                          ? `${colors.activeBg} ${colors.text}`
                          : `text-gray-600 ${colors.hoverBg} hover:text-gray-900`
                      }`}
                    >
                      <span className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 ${
                        isActive
                          ? `${colors.iconBg} ${colors.text} shadow-sm ring-1 ring-black/5`
                          : `${colors.iconBgIdle} ${colors.iconTextIdle} group-hover:${colors.iconBg} group-hover:shadow-sm`
                      }`}>
                        {icons[item.icon]}
                      </span>
                      <span className="flex-1 text-left">{item.name}</span>
                      <span className={`flex items-center justify-center w-5 h-5 rounded transition-all duration-200 ${
                        isExpanded ? 'rotate-90 text-gray-500' : 'text-gray-300'
                      }`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </button>
                    <SubMenuItems items={item.children!} isExpanded={isExpanded} parentColorKey={item.colorKey} />
                  </div>
                )
              }

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? `${colors.activeBg} ${colors.text}`
                      : `text-gray-600 ${colors.hoverBg} hover:text-gray-900`
                  }`}
                >
                  <span className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 ${
                    isActive
                      ? `${colors.iconBg} ${colors.text} shadow-sm ring-1 ring-black/5`
                      : `${colors.iconBgIdle} ${colors.iconTextIdle} group-hover:${colors.iconBg} group-hover:shadow-sm`
                  }`}>
                    {icons[item.icon]}
                  </span>
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-gray-200 z-40 safe-area-bottom">
        <div className="flex justify-around items-center h-16 px-2">
          {allNavigation.slice(0, 5).map((item) => {
            const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href))
            const colors = menuColors[item.colorKey as keyof typeof menuColors] || menuColors.dashboard
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-colors duration-150 ${
                  isActive
                    ? `${colors.text}`
                    : 'text-gray-400 active:text-gray-600'
                }`}
              >
                <span className={`transition-transform duration-150 ${isActive ? 'scale-110' : ''}`}>
                  {icons[item.icon]}
                </span>
                <span className="text-[10px] mt-1 font-medium leading-tight">{item.name}</span>
                {isActive && (
                  <span className={`absolute bottom-1 w-1 h-1 rounded-full ${colors.text.replace('text-', 'bg-')}`} />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
