/* js/config.js — Supabase সংযোগ + গ্লোবাল ভেরিয়েবল */
// ============================================================
// CONFIG
// ============================================================
const SUPABASE_URL = 'https://zalzlqabfbpxnavbxchx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_O3FCdhsMo4gviKn_B6_XLg_5tA-V5S0';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentTeacher = null;
let currentStudent = null;
let currentPinSession = null;
let liveChannel = null;
let pinTimerInterval = null;
let activeSessionCheckInterval = null;
let pendingConfirmation = null;
let liveReportInterval = null;
let scheduledBannerInterval = null;

let currentRoutineData = null;
let currentRoutineContext = null;

let deviceId = localStorage.getItem('amc_device_id');
if (!deviceId) {
  deviceId = 'dev_' + Math.random().toString(36).slice(2) + Date.now();
  localStorage.setItem('amc_device_id', deviceId);
}
