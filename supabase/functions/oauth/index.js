const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'SUPABASE_URL';
const supabaseKey = 'SUPABASE_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchSalesAccounts(contactId) {
  try {
    const response = await supabase.functions.invoke('getSalesAccounts', {
      context: { contact_id: contactId }
    });
    const data = response.data;
    console.log(data);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Example usage
fetchSalesAccounts('your_contact_id');