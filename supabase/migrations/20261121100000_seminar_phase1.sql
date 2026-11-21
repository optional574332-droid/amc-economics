-- =====================================================================
-- AMC Economics | Seminar module — Phase 1
-- শুধু নতুন টেবিল ও ফাংশন। বিদ্যমান কোনো টেবিলের কলাম/ডেটা বদলায় না।
-- নতুন টেবিল: seminar_settings, seminar_staff, seminar_books, seminar_loans, seminar_stock_log
-- সব টেবিলে RLS চালু এবং anon/authenticated-এর সরাসরি অ্যাক্সেস বন্ধ;
-- সব কাজ হবে টোকেনযুক্ত SECURITY DEFINER ফাংশনের (RPC) মাধ্যমে।
-- =====================================================================

-- ---------- ১. ছোট সহায়ক ফাংশন ----------
create or replace function public._sem_norm_no(p text) returns text
language sql immutable set search_path = public as $$
  select upper(regexp_replace(translate(coalesce(p,''), '০১২৩৪৫৬৭৮৯', '0123456789'), '\s+', '', 'g'))
$$;

create or replace function public._sem_err(p text) returns jsonb
language sql immutable as $$ select jsonb_build_object('ok', false, 'message', p) $$;

-- ---------- ২. টেবিল ----------
create table if not exists public.seminar_settings (
  id int primary key default 1 check (id = 1),
  max_books int not null default 3 check (max_books between 1 and 20),
  loan_days int not null default 14 check (loan_days between 1 and 120),
  block_if_overdue boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.seminar_settings (id) values (1) on conflict (id) do nothing;

-- দায়িত্বপ্রাপ্ত শিক্ষক (Admin সবসময় অনুমোদিত)
create table if not exists public.seminar_staff (
  teacher_id uuid primary key references public.teachers(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- প্রতিটি বইয়ের নম্বরই ইউনিক আইডি; নাম পরে বসানো যাবে
create table if not exists public.seminar_books (
  id uuid primary key default gen_random_uuid(),
  book_no text not null,
  title text check (title is null or char_length(title) <= 200),
  author text check (author is null or char_length(author) <= 150),
  category text check (category is null or char_length(category) <= 80),
  status text not null default 'available'
    check (status in ('available','issued','damaged','lost','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seminar_books_no_chk
    check (char_length(book_no) between 1 and 30 and book_no = public._sem_norm_no(book_no))
);
create unique index if not exists seminar_books_no_uq on public.seminar_books (book_no);

-- আবেদন + বিতরণ + ফেরত: একটি বই-একটি রেকর্ড
create table if not exists public.seminar_loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.seminar_books(id),
  student_id uuid not null references public.students(id),
  status text not null default 'requested'
    check (status in ('requested','issued','returned','rejected','cancelled')),
  source text not null default 'student' check (source in ('student','teacher')),
  mobile text,
  note text,
  requested_at timestamptz not null default now(),
  issued_at timestamptz,
  due_date date,
  issued_by uuid references public.teachers(id),
  year_at_issue text,            -- ইস্যুর সময়ের বর্ষ (পরে প্রমোশন হলেও রিপোর্ট ঠিক থাকবে)
  session_year_at_issue integer,
  returned_at timestamptz,
  received_by uuid references public.teachers(id),
  return_condition text
    check (return_condition is null or return_condition in ('good','minor_damage','major_damage','lost')),
  decision_note text,
  decided_by uuid references public.teachers(id),
  decided_at timestamptz,
  original_due_date date,        -- প্রথম নির্ধারিত তারিখ (মেয়াদ বাড়ালে সংরক্ষিত থাকে)
  extended_count int not null default 0
);
create unique index if not exists seminar_loans_one_issued_per_book
  on public.seminar_loans (book_id) where status = 'issued';
create unique index if not exists seminar_loans_one_open_request
  on public.seminar_loans (book_id, student_id) where status = 'requested';
create index if not exists seminar_loans_student_idx on public.seminar_loans (student_id, status);
create index if not exists seminar_loans_status_due_idx on public.seminar_loans (status, due_date);

-- স্টকের প্রতিটি পরিবর্তনের ইতিহাস
create table if not exists public.seminar_stock_log (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.seminar_books(id),
  loan_id uuid references public.seminar_loans(id),
  action text not null
    check (action in ('add','edit','issue','return','damaged','lost','correction','withdraw')),
  old_status text,
  new_status text,
  by_teacher_id uuid references public.teachers(id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists seminar_stock_log_book_idx on public.seminar_stock_log (book_id, created_at desc);

alter table public.seminar_settings  enable row level security;
alter table public.seminar_staff     enable row level security;
alter table public.seminar_books     enable row level security;
alter table public.seminar_loans     enable row level security;
alter table public.seminar_stock_log enable row level security;
revoke all on public.seminar_settings, public.seminar_staff, public.seminar_books,
              public.seminar_loans, public.seminar_stock_log from anon, authenticated;

-- ---------- ৩. পরিচয় যাচাই (বিদ্যমান টোকেন ব্যবস্থা ব্যবহার করে) ----------
create or replace function public._sem_actor(p_token text, out a_tid uuid, out a_admin boolean, out a_staff boolean)
returns record language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if coalesce(length(p_token), 0) >= 32 then
    -- শিক্ষক: বিদ্যমান টোকেন ব্যবস্থা
    a_tid := public._teacher_id_from_token(p_token);
  else
    -- Admin: ইমেইল/পাসওয়ার্ডে লগইন (Supabase Auth); অ্যাপ এখানে p_token = null পাঠাবে
    select t.id into a_tid from public.teachers t
     where t.auth_user_id = auth.uid() and t.is_admin = true and coalesce(t.is_active, true) = true
     limit 1;
  end if;
  if a_tid is null then return; end if;
  select coalesce(t.is_admin, false) into a_admin from public.teachers t where t.id = a_tid;
  a_admin := coalesce(a_admin, false);
  a_staff := a_admin or exists (select 1 from public.seminar_staff s where s.teacher_id = a_tid);
end $$;

create or replace function public._sem_student(p_token text) returns uuid
language plpgsql stable security definer set search_path = public, extensions as $$
declare v uuid;
begin
  if coalesce(length(p_token), 0) <> 64 then return null; end if;
  select s.id into v
  from private.student_access_tokens t
  join public.students s on s.id = t.student_id
  where t.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and t.revoked_at is null and t.expires_at > now()
    and s.status = 'active' and coalesce(s.is_archived, false) = false
  limit 1;
  return v;
end $$;

-- ---------- ৪. মূল Issue যুক্তি (একই জায়গা থেকে সব ইস্যু যাবে) ----------
create or replace function public._sem_issue_core(
  p_actor uuid, p_admin boolean, p_loan_id uuid, p_student_id uuid, p_book_id uuid,
  p_mobile text, p_due date, p_force boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_set public.seminar_settings%rowtype;
  v_book public.seminar_books%rowtype;
  v_st public.students%rowtype;
  v_loan public.seminar_loans%rowtype;
  v_issued int; v_over int; v_due date; v_id uuid; v_today date := public.bd_today();
  v_mob text := nullif(btrim(coalesce(p_mobile, '')), '');
begin
  select * into v_set from public.seminar_settings where id = 1;
  select * into v_st from public.students where id = p_student_id;
  if not found or v_st.status <> 'active' or coalesce(v_st.is_archived, false) then
    return public._sem_err('শিক্ষার্থী পাওয়া যায়নি বা সক্রিয় নয়');
  end if;

  select * into v_book from public.seminar_books where id = p_book_id for update;
  if not found then return public._sem_err('বইটি পাওয়া যায়নি'); end if;
  if v_book.status <> 'available' then
    return public._sem_err('এই বইটি এখন স্টকে নেই (অবস্থা: ' || v_book.status || ')');
  end if;

  select count(*) into v_issued from public.seminar_loans where student_id = p_student_id and status = 'issued';
  select count(*) into v_over from public.seminar_loans
    where student_id = p_student_id and status = 'issued' and due_date < v_today;
  if not (p_force and p_admin) then
    if v_issued >= v_set.max_books then
      return public._sem_err('এই শিক্ষার্থীর কাছে ইতোমধ্যে সর্বোচ্চ সংখ্যক বই (' || v_set.max_books || 'টি) আছে');
    end if;
    if v_set.block_if_overdue and v_over > 0 then
      return public._sem_err('এই শিক্ষার্থীর ' || v_over || 'টি বই ফেরত দেওয়ার সময় পার হয়েছে');
    end if;
  end if;

  v_due := coalesce(p_due, v_today + v_set.loan_days);
  if v_due < v_today then return public._sem_err('ফেরতের তারিখ আজকের আগে হতে পারে না'); end if;

  if p_loan_id is not null then
    select * into v_loan from public.seminar_loans where id = p_loan_id for update;
    if not found or v_loan.status <> 'requested'
       or v_loan.student_id <> p_student_id or v_loan.book_id <> p_book_id then
      return public._sem_err('আবেদনটি আর বৈধ নেই (ইতোমধ্যে নিষ্পন্ন বা বাতিল)');
    end if;
    update public.seminar_loans
       set status = 'issued', issued_at = now(), due_date = v_due, issued_by = p_actor,
           year_at_issue = v_st.year, session_year_at_issue = v_st.session_year,
           mobile = coalesce(v_mob, mobile), decided_by = p_actor, decided_at = now()
     where id = p_loan_id;
    v_id := p_loan_id;
  else
    insert into public.seminar_loans
      (book_id, student_id, status, source, mobile, issued_at, due_date, issued_by,
       year_at_issue, session_year_at_issue, decided_by, decided_at)
    values (p_book_id, p_student_id, 'issued', 'teacher', v_mob, now(), v_due, p_actor,
            v_st.year, v_st.session_year, p_actor, now())
    returning id into v_id;
  end if;

  update public.seminar_books set status = 'issued', updated_at = now() where id = p_book_id;
  insert into public.seminar_stock_log (book_id, loan_id, action, old_status, new_status, by_teacher_id)
  values (p_book_id, v_id, 'issue', 'available', 'issued', p_actor);

  -- একই বইয়ের অন্য শিক্ষার্থীদের খোলা আবেদন স্বয়ংক্রিয় বাতিল
  update public.seminar_loans
     set status = 'rejected', decision_note = 'বইটি অন্য শিক্ষার্থীকে দেওয়া হয়েছে', decided_at = now()
   where book_id = p_book_id and status = 'requested' and id <> v_id;

  return jsonb_build_object('ok', true, 'loan_id', v_id, 'due_date', v_due);
end $$;

-- ---------- ৫. শিক্ষক / দায়িত্বপ্রাপ্ত শিক্ষক ----------
create or replace function public.sem_issue_request(p_token text, p_loan_id uuid, p_due date default null, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a record; v_loan public.seminar_loans%rowtype;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('বই ইস্যুর অনুমতি আপনার নেই'); end if;
  select * into v_loan from public.seminar_loans where id = p_loan_id;
  if not found then return public._sem_err('আবেদনটি পাওয়া যায়নি'); end if;
  return public._sem_issue_core(a.a_tid, a.a_admin, p_loan_id, v_loan.student_id, v_loan.book_id, null, p_due, p_force);
end $$;

create or replace function public.sem_issue_direct(p_token text, p_student_id uuid, p_book_no text,
  p_mobile text default null, p_due date default null, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a record; v_book uuid; v_req uuid;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('বই ইস্যুর অনুমতি আপনার নেই'); end if;
  select id into v_book from public.seminar_books where book_no = public._sem_norm_no(p_book_no);
  if v_book is null then return public._sem_err('এই নম্বরের বই পাওয়া যায়নি'); end if;
  select id into v_req from public.seminar_loans
    where book_id = v_book and student_id = p_student_id and status = 'requested';
  return public._sem_issue_core(a.a_tid, a.a_admin, v_req, p_student_id, v_book, p_mobile, p_due, p_force);
end $$;

create or replace function public.sem_reject(p_token text, p_loan_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a record; n int;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('এই কাজের অনুমতি আপনার নেই'); end if;
  update public.seminar_loans
     set status = 'rejected', decision_note = left(nullif(btrim(coalesce(p_reason,'')), ''), 300),
         decided_by = a.a_tid, decided_at = now()
   where id = p_loan_id and status = 'requested';
  get diagnostics n = row_count;
  if n = 0 then return public._sem_err('আবেদনটি আর খোলা নেই'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sem_return(p_token text, p_loan_id uuid, p_condition text default 'good', p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a record; v_loan public.seminar_loans%rowtype; v_new text; v_act text;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('বই গ্রহণের অনুমতি আপনার নেই'); end if;
  if p_condition not in ('good','minor_damage','major_damage','lost') then
    return public._sem_err('বইয়ের অবস্থা সঠিক নয়');
  end if;
  select * into v_loan from public.seminar_loans where id = p_loan_id for update;
  if not found or v_loan.status <> 'issued' then
    return public._sem_err('এই বই ইতোমধ্যে ফেরত নেওয়া হয়েছে বা ইস্যু করা নেই');
  end if;
  perform 1 from public.seminar_books where id = v_loan.book_id for update;
  v_new := case p_condition when 'good' then 'available' when 'minor_damage' then 'available'
                            when 'major_damage' then 'damaged' else 'lost' end;
  v_act := case p_condition when 'major_damage' then 'damaged' when 'lost' then 'lost' else 'return' end;
  update public.seminar_loans
     set status = 'returned', returned_at = now(), received_by = a.a_tid,
         return_condition = p_condition, note = coalesce(left(nullif(btrim(coalesce(p_note,'')), ''), 300), note)
   where id = p_loan_id;
  update public.seminar_books set status = v_new, updated_at = now() where id = v_loan.book_id;
  insert into public.seminar_stock_log (book_id, loan_id, action, old_status, new_status, by_teacher_id, note)
  values (v_loan.book_id, p_loan_id, v_act, 'issued', v_new, a.a_tid, left(p_note, 300));
  return jsonb_build_object('ok', true, 'book_status', v_new);
end $$;

-- খোঁজার দুটি উপায়: (১) সেশন + ক্লাস রোল/রেজি. (ইউনিক), (২) শুধু রোল/নাম (একাধিক ফল আসতে পারে, বর্ষ দেখানো হয়)
create or replace function public.sem_find_student(p_token text, p_query text, p_session text default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v_q text; v_s text; v jsonb;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('এই কাজের অনুমতি আপনার নেই'); end if;
  v_s := nullif(btrim(coalesce(p_session, '')), '');
  v_q := btrim(translate(coalesce(p_query, ''), '০১২৩৪৫৬৭৮৯', '0123456789'));
  if char_length(v_q) < 1 then return public._sem_err('রোল, রেজি. নম্বর বা নাম লিখুন'); end if;
  select coalesce(jsonb_agg(x.j order by x.ord, x.year, x.nm), '[]'::jsonb) into v from (
    select (case when s.class_roll = v_q or s.reg_no = v_q then 0 else 1 end) as ord, s.year, s.name as nm,
      jsonb_build_object('student_id', s.id, 'name', s.name, 'year', s.year, 'session', s.session,
        'session_year', s.session_year, 'class_roll', s.class_roll, 'reg_no', s.reg_no,
        'issued_count', (select count(*) from public.seminar_loans l where l.student_id = s.id and l.status = 'issued'),
        'overdue_count', (select count(*) from public.seminar_loans l
                           where l.student_id = s.id and l.status = 'issued' and l.due_date < public.bd_today())) as j
    from public.students s
    where s.status = 'active' and coalesce(s.is_archived, false) = false
      and (v_s is null or s.session = v_s)
      and (s.class_roll = v_q or s.reg_no = v_q
           or (char_length(v_q) >= 2 and s.name ilike '%' || replace(replace(v_q, '%', '\%'), '_', '\_') || '%'))
    limit 20
  ) x;
  return jsonb_build_object('ok', true, 'items', v);
end $$;

create or replace function public.sem_pending(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v jsonb;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('এই কাজের অনুমতি আপনার নেই'); end if;
  select coalesce(jsonb_agg(x.j order by x.requested_at), '[]'::jsonb) into v from (
    select l.requested_at, jsonb_build_object(
      'loan_id', l.id, 'book_id', b.id, 'book_no', b.book_no, 'title', b.title, 'book_status', b.status,
      'student_id', s.id, 'student_name', s.name, 'year', s.year, 'session_year', s.session_year,
      'class_roll', s.class_roll, 'mobile', l.mobile, 'requested_at', l.requested_at,
      'student_issued_count', (select count(*) from public.seminar_loans i where i.student_id = s.id and i.status = 'issued'),
      'student_overdue_count', (select count(*) from public.seminar_loans i
                                 where i.student_id = s.id and i.status = 'issued' and i.due_date < public.bd_today())) as j
    from public.seminar_loans l
    join public.seminar_books b on b.id = l.book_id
    join public.students s on s.id = l.student_id
    where l.status = 'requested'
  ) x;
  return jsonb_build_object('ok', true, 'items', v);
end $$;

-- বর্তমানে ইস্যু করা বই (ফেরত নেওয়ার পর্দা); p_student_id দিলে শুধু তার
create or replace function public.sem_issued(p_token text, p_student_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v jsonb;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('এই কাজের অনুমতি আপনার নেই'); end if;
  select coalesce(jsonb_agg(x.j order by x.due_date, x.student_name), '[]'::jsonb) into v from (
    select l.due_date, s.name as student_name, jsonb_build_object(
      'loan_id', l.id, 'book_id', b.id, 'book_no', b.book_no, 'title', b.title,
      'student_id', s.id, 'student_name', s.name, 'year', s.year, 'session_year', s.session_year,
      'class_roll', s.class_roll, 'mobile', l.mobile, 'issued_at', l.issued_at, 'due_date', l.due_date,
      'days_late', greatest(public.bd_today() - l.due_date, 0)) as j
    from public.seminar_loans l
    join public.seminar_books b on b.id = l.book_id
    join public.students s on s.id = l.student_id
    where l.status = 'issued' and (p_student_id is null or l.student_id = p_student_id)
  ) x;
  return jsonb_build_object('ok', true, 'items', v);
end $$;

create or replace function public.sem_overdue(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v jsonb;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('এই কাজের অনুমতি আপনার নেই'); end if;
  select coalesce(jsonb_agg(x.j order by x.due_date, x.student_name), '[]'::jsonb) into v from (
    select l.due_date, s.name as student_name, jsonb_build_object(
      'loan_id', l.id, 'book_no', b.book_no, 'title', b.title,
      'student_id', s.id, 'student_name', s.name, 'year', s.year, 'session_year', s.session_year,
      'class_roll', s.class_roll, 'mobile', l.mobile, 'issued_at', l.issued_at, 'due_date', l.due_date,
      'days_late', public.bd_today() - l.due_date) as j
    from public.seminar_loans l
    join public.seminar_books b on b.id = l.book_id
    join public.students s on s.id = l.student_id
    where l.status = 'issued' and l.due_date < public.bd_today()
  ) x;
  return jsonb_build_object('ok', true, 'items', v);
end $$;

-- বইয়ের তালিকা (ড্রপডাউনের জন্য) — যেকোনো সক্রিয় শিক্ষক দেখতে পারবেন
create or replace function public.sem_books(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v jsonb;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'book_no', b.book_no, 'title', b.title,
           'author', b.author, 'category', b.category, 'status', b.status) order by b.book_no), '[]'::jsonb)
    into v from public.seminar_books b;
  return jsonb_build_object('ok', true, 'items', v);
end $$;

create or replace function public.sem_stock_summary(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v_tot jsonb; v_cat jsonb;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  select jsonb_build_object(
    'total', count(*), 'available', count(*) filter (where status = 'available'),
    'issued', count(*) filter (where status = 'issued'), 'damaged', count(*) filter (where status = 'damaged'),
    'lost', count(*) filter (where status = 'lost'), 'withdrawn', count(*) filter (where status = 'withdrawn'),
    'without_title', count(*) filter (where title is null),
    'overdue', (select count(*) from public.seminar_loans where status = 'issued' and due_date < public.bd_today()),
    'pending_requests', (select count(*) from public.seminar_loans where status = 'requested'))
    into v_tot from public.seminar_books;
  select coalesce(jsonb_agg(jsonb_build_object('category', c.cat, 'total', c.t, 'available', c.av, 'issued', c.iss)
           order by c.cat), '[]'::jsonb) into v_cat
  from (select coalesce(category, '(ক্যাটাগরি নেই)') as cat, count(*) as t,
               count(*) filter (where status = 'available') as av, count(*) filter (where status = 'issued') as iss
        from public.seminar_books group by 1) c;
  return jsonb_build_object('ok', true, 'summary', v_tot, 'by_category', v_cat);
end $$;

create or replace function public.sem_settings_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; s public.seminar_settings%rowtype;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  select * into s from public.seminar_settings where id = 1;
  return jsonb_build_object('ok', true, 'max_books', s.max_books, 'loan_days', s.loan_days,
                            'block_if_overdue', s.block_if_overdue, 'is_admin', a.a_admin, 'is_staff', a.a_staff);
end $$;

-- ইস্যু করা বইয়ের ফেরতের তারিখ বাড়ানো (ক্যালেন্ডার থেকে নতুন তারিখ)
create or replace function public.sem_extend_due(p_token text, p_loan_id uuid, p_new_due date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a record; v_loan public.seminar_loans%rowtype;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('এই কাজের অনুমতি আপনার নেই'); end if;
  if p_new_due is null then return public._sem_err('নতুন তারিখ বেছে নিন'); end if;
  select * into v_loan from public.seminar_loans where id = p_loan_id for update;
  if not found or v_loan.status <> 'issued' then
    return public._sem_err('বইটি এখন ইস্যু অবস্থায় নেই');
  end if;
  if p_new_due <= v_loan.due_date then
    return public._sem_err('নতুন তারিখ বর্তমান ফেরতের তারিখের পরে হতে হবে');
  end if;
  if p_new_due > public.bd_today() + 120 then
    return public._sem_err('আজ থেকে সর্বোচ্চ ১২০ দিন পর্যন্ত বাড়ানো যাবে');
  end if;
  update public.seminar_loans
     set due_date = p_new_due, original_due_date = coalesce(original_due_date, due_date),
         extended_count = extended_count + 1
   where id = p_loan_id;
  return jsonb_build_object('ok', true, 'due_date', p_new_due);
end $$;

-- ---------- ৬. রিপোর্ট (দায়িত্বপ্রাপ্ত শিক্ষক ও Admin) ----------
create or replace function public.sem_report_year_wise(p_token text, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v jsonb;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('রিপোর্ট দেখার অনুমতি আপনার নেই'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('year', r.yr, 'session_year', r.sy, 'books_issued', r.n,
           'students', r.st, 'returned', r.ret, 'still_out', r.still_out) order by r.yr, r.sy desc), '[]'::jsonb)
    into v
  from (select l.year_at_issue as yr, l.session_year_at_issue as sy, count(*) as n,
               count(distinct l.student_id) as st,
               count(*) filter (where l.status = 'returned') as ret,
               count(*) filter (where l.status = 'issued') as still_out
        from public.seminar_loans l
        where l.issued_at is not null
          and (p_from is null or (l.issued_at at time zone 'Asia/Dhaka')::date >= p_from)
          and (p_to is null or (l.issued_at at time zone 'Asia/Dhaka')::date <= p_to)
        group by 1, 2) r;
  return jsonb_build_object('ok', true, 'items', v);
end $$;

create or replace function public.sem_report_student(p_token text, p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v jsonb; s public.students%rowtype;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('রিপোর্ট দেখার অনুমতি আপনার নেই'); end if;
  select * into s from public.students where id = p_student_id;
  if not found then return public._sem_err('শিক্ষার্থী পাওয়া যায়নি'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('loan_id', l.id, 'book_no', b.book_no, 'title', b.title,
           'status', l.status, 'issued_at', l.issued_at, 'due_date', l.due_date, 'returned_at', l.returned_at,
           'return_condition', l.return_condition, 'year_at_issue', l.year_at_issue) order by l.requested_at desc), '[]'::jsonb)
    into v
  from public.seminar_loans l join public.seminar_books b on b.id = l.book_id where l.student_id = p_student_id;
  return jsonb_build_object('ok', true, 'student', jsonb_build_object('name', s.name, 'year', s.year,
    'session_year', s.session_year, 'class_roll', s.class_roll, 'reg_no', s.reg_no), 'items', v);
end $$;

create or replace function public.sem_report_book(p_token text, p_book_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; b public.seminar_books%rowtype; v_loans jsonb; v_log jsonb;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_staff then return public._sem_err('রিপোর্ট দেখার অনুমতি আপনার নেই'); end if;
  select * into b from public.seminar_books where id = p_book_id;
  if not found then return public._sem_err('বইটি পাওয়া যায়নি'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('student_name', s.name, 'year', s.year, 'class_roll', s.class_roll,
           'status', l.status, 'issued_at', l.issued_at, 'due_date', l.due_date, 'returned_at', l.returned_at,
           'return_condition', l.return_condition) order by l.requested_at desc), '[]'::jsonb)
    into v_loans
  from public.seminar_loans l join public.students s on s.id = l.student_id where l.book_id = p_book_id;
  select coalesce(jsonb_agg(jsonb_build_object('action', g.action, 'old_status', g.old_status,
           'new_status', g.new_status, 'by', t.name, 'note', g.note, 'at', g.created_at) order by g.created_at desc), '[]'::jsonb)
    into v_log
  from public.seminar_stock_log g left join public.teachers t on t.id = g.by_teacher_id where g.book_id = p_book_id;
  return jsonb_build_object('ok', true, 'book', jsonb_build_object('book_no', b.book_no, 'title', b.title,
    'author', b.author, 'category', b.category, 'status', b.status), 'loans', v_loans, 'stock_log', v_log);
end $$;

-- ---------- ৭. Admin ----------
-- Excel থেকে বই যোগ/হালনাগাদ: [{book_no,title,author,category},...]
-- নতুন নম্বর হলে বই যোগ হয়; বিদ্যমান নম্বরে শুধু ফাঁকা নয় এমন নাম/লেখক/ক্যাটাগরি হালনাগাদ হয় (অবস্থা অপরিবর্তিত)
create or replace function public.sem_admin_add_books(p_token text, p_books jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  a record; it jsonb; v_no text; v_t text; v_a text; v_c text; v_id uuid; n int;
  v_ins int := 0; v_upd int := 0; v_skip int := 0; v_bad jsonb := '[]'::jsonb;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_admin then return public._sem_err('শুধু Admin বই যোগ করতে পারবেন'); end if;
  if p_books is null or jsonb_typeof(p_books) <> 'array' or jsonb_array_length(p_books) = 0
     or jsonb_array_length(p_books) > 1000 then
    return public._sem_err('এক সঙ্গে ১ থেকে ১০০০টি বই দেওয়া যাবে');
  end if;
  for it in select value from jsonb_array_elements(p_books) loop
    v_no := public._sem_norm_no(it->>'book_no');
    if v_no = '' or char_length(v_no) > 30 then
      v_skip := v_skip + 1; v_bad := v_bad || to_jsonb(coalesce(it->>'book_no', '(খালি)')); continue;
    end if;
    v_t := left(nullif(btrim(coalesce(it->>'title', '')), ''), 200);
    v_a := left(nullif(btrim(coalesce(it->>'author', '')), ''), 150);
    v_c := left(nullif(btrim(coalesce(it->>'category', '')), ''), 80);
    select id into v_id from public.seminar_books where book_no = v_no for update;
    if found then
      update public.seminar_books
         set title = coalesce(v_t, title), author = coalesce(v_a, author),
             category = coalesce(v_c, category), updated_at = now()
       where id = v_id and (title is distinct from coalesce(v_t, title)
                         or author is distinct from coalesce(v_a, author)
                         or category is distinct from coalesce(v_c, category));
      get diagnostics n = row_count;
      if n > 0 then
        v_upd := v_upd + 1;
        insert into public.seminar_stock_log (book_id, action, by_teacher_id, note)
        values (v_id, 'edit', a.a_tid, 'নাম/লেখক/ক্যাটাগরি হালনাগাদ');
      end if;
    else
      insert into public.seminar_books (book_no, title, author, category)
      values (v_no, v_t, v_a, v_c) returning id into v_id;
      insert into public.seminar_stock_log (book_id, action, new_status, by_teacher_id)
      values (v_id, 'add', 'available', a.a_tid);
      v_ins := v_ins + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'inserted', v_ins, 'updated', v_upd, 'skipped', v_skip, 'skipped_items', v_bad);
end $$;

create or replace function public.sem_admin_update_book(p_token text, p_book_id uuid, p_title text, p_author text, p_category text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a record; n int;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_admin then return public._sem_err('শুধু Admin বইয়ের তথ্য বদলাতে পারবেন'); end if;
  update public.seminar_books
     set title = left(nullif(btrim(coalesce(p_title, '')), ''), 200),
         author = left(nullif(btrim(coalesce(p_author, '')), ''), 150),
         category = left(nullif(btrim(coalesce(p_category, '')), ''), 80), updated_at = now()
   where id = p_book_id;
  get diagnostics n = row_count;
  if n = 0 then return public._sem_err('বইটি পাওয়া যায়নি'); end if;
  insert into public.seminar_stock_log (book_id, action, by_teacher_id, note) values (p_book_id, 'edit', a.a_tid, 'তথ্য সংশোধন');
  return jsonb_build_object('ok', true);
end $$;

-- স্টক সংশোধন: available / damaged / lost / withdrawn (ইস্যু থাকা বইয়ে নয়)
create or replace function public.sem_admin_set_book_status(p_token text, p_book_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a record; b public.seminar_books%rowtype;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_admin then return public._sem_err('শুধু Admin স্টক সংশোধন করতে পারবেন'); end if;
  if p_status not in ('available','damaged','lost','withdrawn') then return public._sem_err('অবস্থা সঠিক নয়'); end if;
  if coalesce(btrim(p_note), '') = '' then return public._sem_err('সংশোধনের কারণ লিখুন'); end if;
  select * into b from public.seminar_books where id = p_book_id for update;
  if not found then return public._sem_err('বইটি পাওয়া যায়নি'); end if;
  if b.status = 'issued' then return public._sem_err('বইটি এখন শিক্ষার্থীর কাছে আছে; আগে ফেরত নিন'); end if;
  if b.status = p_status then return public._sem_err('বইটি ইতোমধ্যে এই অবস্থায় আছে'); end if;
  update public.seminar_books set status = p_status, updated_at = now() where id = p_book_id;
  insert into public.seminar_stock_log (book_id, action, old_status, new_status, by_teacher_id, note)
  values (p_book_id, case p_status when 'withdrawn' then 'withdraw' when 'damaged' then 'damaged'
                                   when 'lost' then 'lost' else 'correction' end,
          b.status, p_status, a.a_tid, left(p_note, 300));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sem_admin_staff_list(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a record; v jsonb;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_admin then return public._sem_err('শুধু Admin'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('teacher_id', t.id, 'name', t.name, 'is_admin', coalesce(t.is_admin, false),
           'is_staff', coalesce(t.is_admin, false) or exists (select 1 from public.seminar_staff s where s.teacher_id = t.id))
           order by t.name), '[]'::jsonb) into v
  from public.teachers t where coalesce(t.is_active, true);
  return jsonb_build_object('ok', true, 'items', v);
end $$;

create or replace function public.sem_admin_set_staff(p_token text, p_teacher_id uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a record;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_admin then return public._sem_err('শুধু Admin দায়িত্ব দিতে পারবেন'); end if;
  if not exists (select 1 from public.teachers where id = p_teacher_id) then return public._sem_err('শিক্ষক পাওয়া যায়নি'); end if;
  if p_on then
    insert into public.seminar_staff (teacher_id) values (p_teacher_id) on conflict do nothing;
  else
    delete from public.seminar_staff where teacher_id = p_teacher_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sem_admin_set_settings(p_token text, p_max_books int, p_loan_days int, p_block_if_overdue boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a record;
begin
  select * into a from public._sem_actor(p_token);
  if a.a_tid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  if not a.a_admin then return public._sem_err('শুধু Admin নিয়ম বদলাতে পারবেন'); end if;
  if p_max_books not between 1 and 20 or p_loan_days not between 1 and 120 then
    return public._sem_err('বইয়ের সংখ্যা ১–২০ এবং দিন ১–১২০ এর মধ্যে দিন');
  end if;
  update public.seminar_settings
     set max_books = p_max_books, loan_days = p_loan_days,
         block_if_overdue = coalesce(p_block_if_overdue, true), updated_at = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- ৮. শিক্ষার্থী (বিদ্যমান student token দিয়ে) ----------
create or replace function public.sem_s_books(p_student_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sid uuid := public._sem_student(p_student_token); v jsonb;
begin
  if v_sid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'book_no', b.book_no, 'title', b.title,
           'author', b.author, 'category', b.category) order by b.title, b.book_no), '[]'::jsonb) into v
  from public.seminar_books b where b.status = 'available' and b.title is not null;
  return jsonb_build_object('ok', true, 'items', v);
end $$;

create or replace function public.sem_s_request(p_student_token text, p_book_id uuid, p_mobile text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_sid uuid := public._sem_student(p_student_token);
  v_set public.seminar_settings%rowtype; v_b public.seminar_books%rowtype;
  v_m text; v_open int; v_over int; v_id uuid;
begin
  if v_sid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  v_m := regexp_replace(translate(coalesce(p_mobile, ''), '০১২৩৪৫৬৭৮৯', '0123456789'), '[\s-]', '', 'g');
  v_m := regexp_replace(v_m, '^\+?88', '');
  if v_m !~ '^01[3-9][0-9]{8}$' then return public._sem_err('সঠিক মোবাইল নম্বর দিন (১১ সংখ্যা)'); end if;
  select * into v_set from public.seminar_settings where id = 1;
  select * into v_b from public.seminar_books where id = p_book_id;
  if not found or v_b.title is null then return public._sem_err('বইটি পাওয়া যায়নি'); end if;
  if v_b.status <> 'available' then return public._sem_err('বইটি এখন স্টকে নেই'); end if;
  if exists (select 1 from public.seminar_loans where book_id = p_book_id and student_id = v_sid and status = 'requested') then
    return public._sem_err('এই বইয়ের আবেদন আপনি ইতোমধ্যে করেছেন');
  end if;
  select count(*) into v_open from public.seminar_loans where student_id = v_sid and status in ('requested','issued');
  if v_open >= v_set.max_books then
    return public._sem_err('আপনি সর্বোচ্চ ' || v_set.max_books || 'টি বইয়ের আবেদন/গ্রহণ করতে পারবেন');
  end if;
  select count(*) into v_over from public.seminar_loans where student_id = v_sid and status = 'issued' and due_date < public.bd_today();
  if v_set.block_if_overdue and v_over > 0 then
    return public._sem_err('আগের বই ফেরত না দেওয়া পর্যন্ত নতুন আবেদন করা যাবে না');
  end if;
  insert into public.seminar_loans (book_id, student_id, status, source, mobile)
  values (p_book_id, v_sid, 'requested', 'student', v_m) returning id into v_id;
  return jsonb_build_object('ok', true, 'loan_id', v_id);
end $$;

create or replace function public.sem_s_cancel(p_student_token text, p_loan_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_sid uuid := public._sem_student(p_student_token); n int;
begin
  if v_sid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  update public.seminar_loans set status = 'cancelled', decided_at = now()
   where id = p_loan_id and student_id = v_sid and status = 'requested';
  get diagnostics n = row_count;
  if n = 0 then return public._sem_err('এই আবেদন বাতিল করা যাবে না'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sem_s_my(p_student_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_sid uuid := public._sem_student(p_student_token); v jsonb; v_set public.seminar_settings%rowtype;
begin
  if v_sid is null then return public._sem_err('লগইনের মেয়াদ শেষ, আবার লগইন করুন'); end if;
  select * into v_set from public.seminar_settings where id = 1;
  select coalesce(jsonb_agg(x.j order by x.requested_at desc), '[]'::jsonb) into v from (
    select l.requested_at, jsonb_build_object(
      'loan_id', l.id, 'book_no', b.book_no, 'title', b.title, 'status', l.status,
      'requested_at', l.requested_at, 'issued_at', l.issued_at, 'due_date', l.due_date,
      'returned_at', l.returned_at, 'reject_reason', l.decision_note,
      'is_overdue', (l.status = 'issued' and l.due_date < public.bd_today()),
      'days_late', case when l.status = 'issued' and l.due_date < public.bd_today()
                        then public.bd_today() - l.due_date else 0 end) as j
    from public.seminar_loans l join public.seminar_books b on b.id = l.book_id
    where l.student_id = v_sid
    order by l.requested_at desc limit 200
  ) x;
  return jsonb_build_object('ok', true, 'max_books', v_set.max_books, 'loan_days', v_set.loan_days, 'items', v);
end $$;

-- ---------- ৯. অনুমতি: সহায়ক ফাংশন বন্ধ, RPC খোলা ----------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'sem\_%' or p.proname like '\_sem\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname like 'sem\_%' then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.sig);
    else
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;
