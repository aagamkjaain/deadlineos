import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('title', '__SYSTEM_CONFIG__');

  if (error) {
    console.error('Error fetching config:', error);
  } else {
    console.log('Config rows:', data);
  }
}

main();
