# amc-economics
Attendance system for AMC Economics (Department of Economics, Ananda Mohan College)

## ফাইল কাঠামো
- `index.html` — শুধু পাতার কাঠামো (HTML)
- `css/style.css` — সব ডিজাইন
- `js/` — সব কোড, বিষয় অনুযায়ী ভাগ করা
  - `config.js` সংযোগ ও গ্লোবাল ভেরিয়েবল · `utils.js` সাধারণ সহায়ক ফাংশন
  - `routine.js` রুটিন · `directory.js` শিক্ষক ডিরেক্টরি/নোটিশ · `attendance.js` স্টুডেন্টের হাজিরা
  - `auth.js` অ্যাডমিন লগইন · `admin.js` অ্যাডমিন ট্যাব · `academic.js` কোর্স/পরীক্ষার ধরন/ম্যাপিং
  - `people.js` শিক্ষক ও স্টুডেন্ট ম্যানেজমেন্ট · `reports.js` রিপোর্ট · `backup.js` ব্যাকআপ
  - `teacher.js` শিক্ষক প্যানেল · `teacher-routine.js` শিক্ষকের রুটিন · `student.js` স্টুডেন্ট প্যানেল
  - `exam.js` পরীক্ষার সময়সূচি · `app.js` অ্যাপ চালু (সবার শেষে লোড হয়)
- `sw.js`, `manifest.json` — PWA · `vercel.json` — হোস্টিং সেটিং · `icons/` — আইকন
