// Supabase configuration

const SUPABASE_URL = "https://geoqplvawwhzcwlejwgf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_LVXhvf-4sNce-jHwfHr_rA_LY00Pzm2";

// Initialize Supabase
const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);