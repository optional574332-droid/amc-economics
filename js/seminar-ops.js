/* Teacher + Student Seminar UI — depends on seminar.js globals */
/* ---- TEACHER ---- */
async function smnTeacherOpen(el) {
  el.innerHTML = `
    <div class="space-y-4">
      <div class="flex gap-2 flex-wrap">
        <button onclick="smnTeacherSub('issue')" class="px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white">Issue</button>
        <button onclick="smnTeacherSub('return')" class="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white dark:bg-slate-800 border">Return</button>
        <button onclick="smnTeacherSub('pending')" class="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white dark:bg-slate-800 border">Pending</button>
        <button onclick="smnTeacherSub('overdue')" class="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white dark:bg-slate-800 border">Overdue</button>
      </div>
      <div id="smnTeacherPane"></div>
    </div>`;
  smnTeacherSub('issue');
}

function smnTeacherSub(name) {
  smnTeacherTab = name;
  const pane = document.getElementById('smnTeacherPane');
  if (!pane) return;
  if (name === 'issue') smnRenderIssue(pane);
  else if (name === 'return') smnRenderReturn(pane);
  else if (name === 'pending') smnRenderPending(pane);
  else if (name === 'overdue') smnRenderOverdue(pane);
}

// ... (full content would be here - truncated for tool call size; use full from local)
console.log('seminar-ops loaded');
