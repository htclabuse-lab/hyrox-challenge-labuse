const SUPABASE_URL = 'https://mzyfnmjzlosranptwucr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SjaqadxtlQdtASZ6TqE61g_2MyPRKEC';
const STRIPE_SOLO = 'https://buy.stripe.com/test_28E8wP4zlct67jYglhb3q00';
const STRIPE_DUO = 'https://buy.stripe.com/test_fZu4gz5DpeBe7jYb0Xb3q01';
const STRIPE_RELAIS = 'https://buy.stripe.com/test_00wfZh8PB2Sw47Mb0Xb3q02 ';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function sauvegarderInscription(data) {
  const { error } = await supabase.from('inscriptions').insert([data]);
  if (error) console.error('Erreur Supabase:', error);
  return !error;
}

function getStripeLink(categorie) {
  if (categorie === 'relais') return STRIPE_RELAIS;
  if (categorie.startsWith('duo')) return STRIPE_DUO;
  return STRIPE_SOLO;
}

window.soumettreInscription = async function(formData) {
  const ok = await sauvegarderInscription(formData);
  if (ok) {
    window.location.href = getStripeLink(formData.categorie);
  } else {
    alert('Une erreur est survenue, merci de réessayer.');
  }
}
