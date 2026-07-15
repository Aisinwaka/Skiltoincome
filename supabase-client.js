// Skill2Income — Supabase frontend client.
// Loaded after the Supabase JS CDN script. Fill in your project's URL and anon
// key below (the anon key is safe to expose in frontend code — Row Level
// Security on every table enforces that users only ever see their own rows).

const SUPABASE_URL = 'https://iuoecnpimsfgltesbhzh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_utUXb0WUfgLh-zAG4Ex1gw_EsfBbnHG';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===================== AUTH ===================== */

async function signUpEmail(name, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;
  return data;
}

async function signInEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Phone auth uses Supabase's real OTP flow (needs an SMS provider configured
// in your Supabase project's Auth settings — e.g. Twilio or Termii for Nigeria).
async function signUpPhoneStart(name, phone, password) {
  const { data, error } = await supabase.auth.signUp({
    phone,
    password,
    options: { data: { name } },
  });
  if (error) throw error;
  return data; // triggers a real SMS OTP if a provider is configured
}

async function verifyPhoneOtp(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return data;
}

async function signInGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/onboarding.html' },
  });
  if (error) throw error;
  // Browser redirects to Google, then back — no further code runs here.
}

async function signOut() {
  await supabase.auth.signOut();
}

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function requireLogin() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'auth.html?mode=login';
    return null;
  }
  return session;
}

/* ===================== ASSESSMENT / SCORING ===================== */
// Mirrors the same deterministic algorithm from the Express version, now
// run in the browser and written straight to Postgres under RLS (only the
// signed-in user can write/read their own row — enforced by the DB, not by
// this client code).

function computeAssessment(answers) {
  const skills = answers.skills || [];
  const interests = answers.interests || [];
  const internet = answers.internet || '';
  const device = answers.device || '';
  const availability = answers.availability || '';
  const budget = answers.budget || '';

  const skillsScore = Math.min(95, 40 + skills.filter((s) => s !== 'None yet').length * 8);
  const accessScore = internet.includes('Reliable') ? 88 : internet.includes('Occasional') ? 58 : 30;
  const timeScore = availability.includes('30+') ? 92 : availability.includes('15') ? 68 : 40;
  const financeScore = budget === '₦0' ? 25 : budget.includes('15k+') ? 82 : 55;

  let score = Math.round(skillsScore * 0.35 + accessScore * 0.25 + timeScore * 0.2 + financeScore * 0.2);
  score = Math.min(96, Math.max(28, score));

  let path = 'Digital Freelancing — Graphic Design';
  if (interests.includes('Vocational trade') || skills.includes('Tailoring')) path = 'Vocational Trade — Tailoring & Fashion';
  else if (interests.includes('Agriculture') || skills.includes('Farming')) path = 'Agribusiness — Poultry & Crop Farming';
  else if (interests.includes('Starting a business')) path = 'Micro-Business — Retail & Trading';
  else if (interests.includes('Formal employment')) path = 'Formal Employment — Administrative & Sales Roles';
  else if (skills.includes('Graphic design') || skills.includes('Writing')) path = 'Digital Freelancing — Content & Design';

  const breakdown = [
    { label: 'Skills readiness', value: skillsScore, color: '#16A34A' },
    { label: 'Digital access', value: accessScore, color: '#2563EB' },
    { label: 'Time availability', value: timeScore, color: '#F97316' },
    { label: 'Financial runway', value: financeScore, color: '#8B5CF6' },
  ];
  return { score, path, breakdown };
}

async function submitOnboarding(answers) {
  const session = await getSession();
  if (!session) throw new Error('Not signed in.');
  const { score, path, breakdown } = computeAssessment(answers);

  const { error } = await supabase.from('assessments').insert({
    user_id: session.user.id,
    answers,
    score,
    breakdown,
    path,
  });
  if (error) throw error;
  // The on_assessment_created trigger auto-seeds this user's daily tasks.
  return { score, path, breakdown };
}

async function getLatestAssessment() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('assessments')
    .select('score, path, breakdown, answers, created_at')
    .eq('user_id', session.user.id)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ===================== JOBS ===================== */

function matchScore(userSkills, jobTags) {
  if (!userSkills || !userSkills.length) return 40;
  const overlap = jobTags.filter((tag) => userSkills.includes(tag)).length;
  return Math.min(97, 45 + Math.min(50, overlap * 25));
}

async function listJobsWithMatch() {
  const session = await getSession();
  const { data: jobs, error } = await supabase.from('jobs').select('*').order('id');
  if (error) throw error;

  const assessment = await getLatestAssessment();
  const userSkills = assessment?.answers?.skills || [];

  const { data: applications } = await supabase
    .from('applications')
    .select('job_id')
    .eq('user_id', session.user.id);
  const appliedIds = new Set((applications || []).map((a) => a.job_id));

  return jobs
    .map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      salaryMin: j.salary_min,
      salaryMax: j.salary_max,
      tags: j.tags,
      match: matchScore(userSkills, j.tags),
      applied: appliedIds.has(j.id),
    }))
    .sort((a, b) => b.match - a.match);
}

async function applyToJob(jobId) {
  const session = await getSession();
  const { error } = await supabase.from('applications').insert({ user_id: session.user.id, job_id: jobId });
  if (error) throw error; // unique constraint -> "duplicate key" error if already applied
}

/* ===================== INCOME TRACKER ===================== */

async function listIncome() {
  const session = await getSession();
  const { data, error } = await supabase
    .from('income_entries')
    .select('*')
    .eq('user_id', session.user.id)
    .order('entry_date', { ascending: true });
  if (error) throw error;
  const total = (data || []).reduce((s, e) => s + Number(e.amount), 0);
  return { entries: data || [], total };
}

async function addIncome(amount, note) {
  const session = await getSession();
  const { error } = await supabase.from('income_entries').insert({ user_id: session.user.id, amount, note });
  if (error) throw error;
}

/* ===================== TASKS ===================== */

async function listTasks() {
  const session = await getSession();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', session.user.id)
    .order('id');
  if (error) throw error;
  return data || [];
}

async function setTaskDone(id, done) {
  const { error } = await supabase.from('tasks').update({ done }).eq('id', id);
  if (error) throw error;
}

/* ===================== AI MENTOR CHAT (via Edge Function) ===================== */

async function sendChatMessage(message, mode, lang) {
  const session = await getSession();
  if (!session) throw new Error('Not signed in.');
  const { data, error } = await supabase.functions.invoke('ai-mentor', {
    body: { message, mode, lang },
  });
  if (error) throw error;
  return data;
}
